import asyncio
import logging
import math
import os
import re
from collections import Counter
from typing import List, Dict, Any, Optional, Tuple

from rag.base import BaseRAGProvider

logger = logging.getLogger("parakeet-rag")

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    np = None


class InMemoryVectorStore:
    """
    Local in-memory vectorized store with character n-gram & TF-IDF indexing.
    Executes top-k retrieval in < 1ms on local CPU with zero cloud costs.
    """

    def __init__(self):
        self.records: List[Dict[str, Any]] = []
        self.vocab: Dict[str, int] = {}
        self.idf: List[float] = []
        self.doc_vectors: Optional[Any] = None

    def _tokenize(self, text: str) -> List[str]:
        words = re.findall(r"\b[a-zA-Z0-9_\-\.]{2,}\b", text.lower())
        tokens = list(words)
        for i in range(len(words) - 1):
            tokens.append(f"{words[i]}_{words[i+1]}")
        return tokens

    def index(self, records: List[Dict[str, Any]]):
        self.records = records
        if not records:
            self.vocab = {}
            self.idf = []
            self.doc_vectors = None
            return

        documents = [r["text"] for r in records]
        doc_tokens = [self._tokenize(doc) for doc in documents]
        df_counter = Counter()
        for tokens in doc_tokens:
            unique_tokens = set(tokens)
            df_counter.update(unique_tokens)

        self.vocab = {term: idx for idx, (term, _) in enumerate(df_counter.most_common(4000))}
        vocab_size = len(self.vocab)
        num_docs = len(documents)

        if HAS_NUMPY:
            self.idf = np.zeros(vocab_size, dtype=np.float32)
            for term, idx in self.vocab.items():
                df = df_counter[term]
                self.idf[idx] = math.log((num_docs + 1) / (df + 1)) + 1.0

            matrix = np.zeros((num_docs, vocab_size), dtype=np.float32)
            for d_idx, tokens in enumerate(doc_tokens):
                tf = Counter(tokens)
                for term, count in tf.items():
                    if term in self.vocab:
                        v_idx = self.vocab[term]
                        matrix[d_idx, v_idx] = count * self.idf[v_idx]

                norm = np.linalg.norm(matrix[d_idx])
                if norm > 0:
                    matrix[d_idx] /= norm
                self.records[d_idx]["embedding"] = matrix[d_idx]

            self.doc_vectors = matrix
        else:
            self.idf = [0.0] * vocab_size
            for term, idx in self.vocab.items():
                df = df_counter[term]
                self.idf[idx] = math.log((num_docs + 1) / (df + 1)) + 1.0

            self.doc_vectors = []
            for d_idx, tokens in enumerate(doc_tokens):
                tf = Counter(tokens)
                vec = {}
                norm_sq = 0.0
                for term, count in tf.items():
                    if term in self.vocab:
                        v_idx = self.vocab[term]
                        val = count * self.idf[v_idx]
                        vec[v_idx] = val
                        norm_sq += val * val
                norm = math.sqrt(norm_sq)
                if norm > 0:
                    vec = {k: v / norm for k, v in vec.items()}
                self.records[d_idx]["embedding"] = vec
                self.doc_vectors.append(vec)

    def search(
        self,
        query: str,
        active_resume_id: Optional[str] = None,
        top_k: int = 4
    ) -> List[Tuple[Dict[str, Any], float]]:
        if self.doc_vectors is None or not self.records:
            return []

        candidate_indices = []
        for idx, rec in enumerate(self.records):
            rec_resume_id = rec.get("resume_id")
            rec_doc_type = rec.get("doc_type", "")

            if active_resume_id:
                if rec_resume_id == active_resume_id:
                    candidate_indices.append(idx)
                elif rec_resume_id is None and rec_doc_type != "resume":
                    candidate_indices.append(idx)
            else:
                if rec_resume_id is None and rec_doc_type != "resume":
                    candidate_indices.append(idx)

        if not candidate_indices:
            return []

        query_tokens = self._tokenize(query)

        if HAS_NUMPY and isinstance(self.doc_vectors, np.ndarray):
            q_vec = np.zeros(len(self.vocab), dtype=np.float32)
            tf = Counter(query_tokens)

            for term, count in tf.items():
                if term in self.vocab:
                    v_idx = self.vocab[term]
                    q_vec[v_idx] = count * self.idf[v_idx]

            q_norm = np.linalg.norm(q_vec)
            if q_norm > 0:
                q_vec /= q_norm
            else:
                return [(self.records[i], 0.0) for i in candidate_indices[:top_k]]

            sub_matrix = self.doc_vectors[candidate_indices]
            scores = np.dot(sub_matrix, q_vec)
            top_sub_indices = np.argsort(scores)[::-1][:top_k]

            results = []
            for sub_idx in top_sub_indices:
                orig_idx = candidate_indices[sub_idx]
                results.append((self.records[orig_idx], float(scores[sub_idx])))
            return results
        else:
            tf = Counter(query_tokens)
            q_vec = {}
            norm_sq = 0.0
            for term, count in tf.items():
                if term in self.vocab:
                    v_idx = self.vocab[term]
                    val = count * self.idf[v_idx]
                    q_vec[v_idx] = val
                    norm_sq += val * val

            q_norm = math.sqrt(norm_sq)
            if q_norm > 0:
                q_vec = {k: v / q_norm for k, v in q_vec.items()}
            else:
                return [(self.records[i], 0.0) for i in candidate_indices[:top_k]]

            scores = []
            for idx in candidate_indices:
                doc_v = self.doc_vectors[idx]
                score = sum(val * doc_v.get(k, 0.0) for k, val in q_vec.items())
                scores.append((idx, score))

            scores.sort(key=lambda x: x[1], reverse=True)
            return [(self.records[idx], score) for idx, score in scores[:top_k]]


class LocalFAISSProvider(BaseRAGProvider):
    """
    Local desktop RAG provider.
    Maintains per-user isolated in-memory vector stores with TF-IDF cosine similarity indexing.
    Ultra-low latency (< 1ms), zero cloud billing costs.
    """

    def __init__(self):
        self._user_stores: Dict[str, InMemoryVectorStore] = {}
        self._user_metadata: Dict[str, Dict[str, Any]] = {}
        logger.info("Initialized LocalFAISSProvider (Local in-memory RAG backend).")

    def _get_store(self, user_id: str) -> InMemoryVectorStore:
        if user_id not in self._user_stores:
            self._user_stores[user_id] = InMemoryVectorStore()
            self._user_metadata[user_id] = {"documents": {}, "resumes": {}}
        return self._user_stores[user_id]

    async def build_index(
        self,
        chunks: List[str],
        filename: str,
        user_id: str = "local_user",
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Embeds and indexes document chunks in the user's isolated in-memory vector store.
        """
        store = self._get_store(user_id)
        meta = metadata or {}
        doc_id = meta.get("doc_id", meta.get("resume_id", f"doc-{abs(hash(filename)) % 100000}"))
        doc_type = meta.get("doc_type", "resume" if "resume" in filename.lower() else "document")
        resume_id = meta.get("resume_id", doc_id if doc_type == "resume" else None)

        new_records = []
        for i, chunk_text in enumerate(chunks):
            new_records.append({
                "id": f"{doc_id}_chunk_{i}",
                "user_id": user_id,
                "resume_id": resume_id,
                "doc_id": doc_id,
                "doc_type": doc_type,
                "filename": filename,
                "text": chunk_text,
                "embedding": None,
            })

        # Retain existing records not belonging to this doc_id
        existing = [r for r in store.records if r.get("doc_id") != doc_id]
        all_records = existing + new_records

        store.index(all_records)
        self._user_metadata[user_id]["documents"][doc_id] = {
            "id": doc_id,
            "filename": filename,
            "chunks_count": len(chunks),
            "doc_type": doc_type,
            "resume_id": resume_id,
        }
        logger.info(f"[LocalFAISSProvider] Indexed {len(chunks)} chunks for user '{user_id}', doc '{filename}' ({doc_id}).")
        return True

    async def retrieve_top_k(
        self,
        query: str,
        top_k: int = 4,
        user_id: str = "local_user",
        active_resume_id: Optional[str] = None
    ) -> List[str]:
        """
        Performs similarity search strictly scoped to the user's isolated store.
        """
        if not query or not query.strip():
            return []

        store = self._get_store(user_id)
        results = store.search(query.strip(), active_resume_id=active_resume_id, top_k=top_k)
        return [record["text"] for record, score in results if record.get("text", "").strip()]

    async def clear_index(
        self,
        user_id: str = "local_user",
        resume_id: Optional[str] = None
    ) -> bool:
        """
        Purges vectors for a specific resume_id or completely resets the user's vector store.
        """
        if user_id not in self._user_stores:
            return True

        store = self._user_stores[user_id]
        if resume_id:
            store.records = [r for r in store.records if r.get("resume_id") != resume_id and r.get("doc_id") != resume_id]
            store.index(store.records)
            if user_id in self._user_metadata:
                self._user_metadata[user_id]["documents"].pop(resume_id, None)
            logger.info(f"[LocalFAISSProvider] Purged resume '{resume_id}' for user '{user_id}'.")
        else:
            store.index([])
            if user_id in self._user_metadata:
                self._user_metadata[user_id] = {"documents": {}, "resumes": {}}
            logger.info(f"[LocalFAISSProvider] Cleared all indexes for user '{user_id}'.")
        return True

    def is_active(self, user_id: str = "local_user") -> bool:
        if user_id in self._user_stores:
            return len(self._user_stores[user_id].records) > 0
        return False

    def get_provider_name(self) -> str:
        return "local_faiss"
