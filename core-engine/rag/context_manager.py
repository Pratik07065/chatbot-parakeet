import io
import json
import logging
import math
import os
import re
import time
from collections import Counter
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("parakeet-rag")

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    np = None

try:
    from pypdf import PdfReader
    HAS_PYPDF = True
except Exception as e:
    HAS_PYPDF = False
    logger.warning(f"pypdf could not be loaded: {e}. Fallback to raw text extraction.")

from rag.factory import get_rag_provider, set_rag_backend
from rag.base import BaseRAGProvider

# Path to disk storage for resume profiles and embeddings
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESUMES_DATA_DIR = os.path.join(BASE_DIR, "data", "resumes")
os.makedirs(RESUMES_DATA_DIR, exist_ok=True)


class InMemoryVectorStore:
    """
    Partitioned In-Memory Vector Store with Metadata Tagging.
    Enforces strict candidate partitioning by active_resume_id so cosine similarity
    search only evaluates chunks from the selected resume.
    """

    def __init__(self):
        self.records: List[Dict[str, Any]] = []
        self.vocab: Dict[str, int] = {}
        self.idf: List[float] = []
        self.doc_vectors: Optional[Any] = None

    def _tokenize(self, text: str) -> List[str]:
        # Unigrams and bigrams for rich semantic matching
        words = re.findall(r"\b[a-zA-Z0-9_\-\.]{2,}\b", text.lower())
        tokens = list(words)
        for i in range(len(words) - 1):
            tokens.append(f"{words[i]}_{words[i+1]}")
        return tokens

    def index(self, records: List[Dict[str, Any]]):
        """
        Index list of chunk records. Each record structure:
        {
            "id": chunk_id,
            "resume_id": resume_id or None,
            "doc_id": doc_id,
            "doc_type": doc_type, # "resume" | "document" | "notes"
            "text": chunk_text,
            "embedding": vector_embedding (populated after indexing)
        }
        """
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
        top_k: int = 3
    ) -> List[Tuple[Dict[str, Any], float]]:
        """
        Partitioned vector search:
        - If active_resume_id is provided: ONLY search chunks where record['resume_id'] == active_resume_id (or non-resume supplemental docs).
          Chunks belonging to other resumes are strictly isolated and ignored.
        - If active_resume_id is None / empty: Resume chunks are strictly excluded, only general knowledge/supplemental docs are searched.
        """
        if self.doc_vectors is None or not self.records:
            return []

        # Partition candidate indices strictly based on active_resume_id
        candidate_indices = []
        for idx, rec in enumerate(self.records):
            rec_resume_id = rec.get("resume_id")
            rec_doc_type = rec.get("doc_type", "")

            if active_resume_id:
                # Strictly isolate to active_resume_id. Ignore all other resumes.
                if rec_resume_id == active_resume_id:
                    candidate_indices.append(idx)
                elif rec_resume_id is None and rec_doc_type != "resume":
                    # Supplemental non-resume doc
                    candidate_indices.append(idx)
            else:
                # No resume is active: do not cross-contaminate any private resume chunks
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

            # Slice candidate subset matrix for partitioned cosine ranking
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


class ContextManager:
    """
    Principal RAG Context Manager:
    - Partitioned vector store indexation with metadata tagging
    - Strict scope locking per active_resume_id
    - Complete cascade deletion of in-memory vector embeddings and on-disk files
    - Grounded raw context retrieval for LLM generation
    """

    def __init__(self):
        self.resumes: Dict[str, Dict[str, Any]] = {}
        self.documents: Dict[str, Dict[str, Any]] = {}
        self.active_resume_id: Optional[str] = None
        self.job_description = ""
        self.vector_store = InMemoryVectorStore()
        self.provider: BaseRAGProvider = get_rag_provider()
        self.resumes_dir = RESUMES_DATA_DIR

    def extract_text_from_file(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract readable raw text from PDF or text file bytes.
        Validates output and logs diagnostics.
        """
        if not file_bytes:
            return ""

        fn_low = filename.lower()
        extracted_text = ""

        if fn_low.endswith(".pdf"):
            extracted_text = self.parse_pdf_bytes(file_bytes)
        else:
            # Try utf-8 first, fallback to latin-1 / ignore
            try:
                extracted_text = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                try:
                    extracted_text = file_bytes.decode("latin-1")
                except Exception:
                    extracted_text = file_bytes.decode("utf-8", errors="ignore")

        # Explicit extraction diagnostics
        char_count = len(extracted_text)
        word_count = len(extracted_text.split())
        logger.info(f"Uploaded {filename}: Extracted {char_count} characters, {word_count} words.")
        if len(extracted_text.strip()) < 50:
            logger.warning(f"Extracted text too short! Potential unparsed PDF or empty file: '{extracted_text.strip()}'")

        return extracted_text

    def set_active_resume(self, resume_id: Optional[str]) -> bool:
        """
        Lock the active search scope so retrieval strictly evaluates
        vectors where metadata.resume_id == resume_id.
        """
        if resume_id and resume_id in self.resumes:
            self.active_resume_id = resume_id
            logger.info(f"Active resume scope locked to: '{resume_id}' ({self.resumes[resume_id]['name']})")
            return True
        elif not resume_id:
            self.active_resume_id = None
            logger.info("Active resume scope cleared. No resume active.")
            return True
        else:
            # Check if matching by filename
            match = next((r_id for r_id, r in self.resumes.items() if r["name"] == resume_id), None)
            if match:
                self.active_resume_id = match
                logger.info(f"Active resume scope locked by filename match: '{match}' ({self.resumes[match]['name']})")
                return True
            logger.warning(f"Resume ID '{resume_id}' not found in active memory.")
            self.active_resume_id = resume_id
            return False

    def get_active_resume(self) -> Optional[Dict[str, Any]]:
        if self.active_resume_id and self.active_resume_id in self.resumes:
            return self.resumes[self.active_resume_id]
        return None

    def get_active_context(self) -> str:
        """
        Returns full raw text of the currently active resume.
        If no resume is active, returns 'No resume provided'.
        """
        if self.active_resume_id and self.active_resume_id in self.resumes:
            active_res = self.resumes[self.active_resume_id]
            raw = active_res.get("raw_text", "").strip()
            if raw:
                return raw
            chunks = active_res.get("chunks", [])
            if chunks:
                return "\n\n".join(chunks)
        return "No resume provided"

    def parse_pdf_bytes(self, file_bytes: bytes) -> str:
        """Extract text from PDF file bytes using PyPDF."""
        if not HAS_PYPDF:
            try:
                return file_bytes.decode("utf-8", errors="ignore")
            except Exception:
                return ""

        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            text_parts = []
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text and page_text.strip():
                    text_parts.append(page_text.strip())
            extracted = "\n\n".join(text_parts)
            if not extracted.strip():
                logger.warning("PyPDF extracted 0 text characters from PDF. Attempting raw text fallback.")
                extracted = file_bytes.decode("utf-8", errors="ignore")
            return extracted
        except Exception as e:
            logger.error(f"Error parsing PDF with pypdf: {e}")
            return file_bytes.decode("utf-8", errors="ignore")

    def _chunk_text(self, text: str) -> List[str]:
        """Split document into coherent section/paragraph chunks."""
        raw_paragraphs = re.split(r"\n\s*\n|\r\n\s*\r\n", text)
        chunks = []
        for p in raw_paragraphs:
            cleaned = " ".join(p.split())
            if len(cleaned) > 25:
                chunks.append(cleaned)

        if not chunks and text.strip():
            chunks = [text.strip()]
        return chunks

    def _rebuild_index(self):
        """Re-indexes all chunk records with metadata tagging into the vector store."""
        all_records: List[Dict[str, Any]] = []

        # Tag every resume chunk with parent resume_id
        for res_id, res in self.resumes.items():
            for i, chunk_text in enumerate(res.get("chunks", [])):
                all_records.append({
                    "id": f"{res_id}_chunk_{i}",
                    "resume_id": res_id,
                    "doc_id": res_id,
                    "doc_type": "resume",
                    "text": chunk_text,
                    "embedding": None,
                })

        # Tag supplemental document chunks
        for doc_id, doc in self.documents.items():
            for i, chunk_text in enumerate(doc.get("chunks", [])):
                all_records.append({
                    "id": f"{doc_id}_chunk_{i}",
                    "resume_id": None,
                    "doc_id": doc_id,
                    "doc_type": doc.get("type", "document"),
                    "text": chunk_text,
                    "embedding": None,
                })

        self.vector_store.index(all_records)
        logger.info(f"Re-indexed in-memory partitioned vector store with {len(all_records)} total chunk records.")

    def _persist_resume_to_disk(self, resume_id: str, filename: str, raw_text: str, chunks: List[str], file_bytes: bytes):
        """Save resume profile JSON, index metadata, and embeddings to disk."""
        try:
            profile_path = os.path.join(self.resumes_dir, f"{resume_id}_profile.json")
            index_path = os.path.join(self.resumes_dir, f"{resume_id}_index.json")
            embeddings_path = os.path.join(self.resumes_dir, f"{resume_id}_embeddings.npy")

            profile_data = {
                "id": resume_id,
                "name": filename,
                "size": f"{max(1, len(file_bytes) // 1024)} KB",
                "words": len(raw_text.split()),
                "chunks_count": len(chunks),
                "created_at": time.time(),
                "raw_text": raw_text,
            }
            with open(profile_path, "w", encoding="utf-8") as f:
                json.dump(profile_data, f, indent=2, ensure_ascii=False)

            index_data = {
                "id": resume_id,
                "chunks": [{"chunk_id": f"{resume_id}_chunk_{i}", "text": c} for i, c in enumerate(chunks)],
            }
            with open(index_path, "w", encoding="utf-8") as f:
                json.dump(index_data, f, indent=2, ensure_ascii=False)

            if HAS_NUMPY:
                resume_embeddings = [
                    rec["embedding"] for rec in self.vector_store.records
                    if rec.get("resume_id") == resume_id and isinstance(rec.get("embedding"), np.ndarray)
                ]
                if resume_embeddings:
                    np.save(embeddings_path, np.array(resume_embeddings))
                else:
                    np.save(embeddings_path, np.zeros((len(chunks), 1), dtype=np.float32))

            logger.info(f"Persisted resume profile & index to disk: {profile_path}")
        except Exception as e:
            logger.warning(f"Could not persist resume {resume_id} to disk: {e}")

    def load_resume(self, file_bytes: bytes, filename: str, resume_id: Optional[str] = None) -> Dict[str, Any]:
        """Load, parse, chunk, index, and persist resume in memory and on disk."""
        doc_id = resume_id or f"res-{abs(hash(filename + str(time.time()))) % 100000}"
        raw_text = self.extract_text_from_file(file_bytes, filename)
        chunks = self._chunk_text(raw_text)

        self.resumes[doc_id] = {
            "id": doc_id,
            "name": filename,
            "raw_text": raw_text,
            "chunks": chunks,
            "size": f"{max(1, len(file_bytes) // 1024)} KB",
            "words": len(raw_text.split()),
        }
        self.active_resume_id = doc_id
        self._rebuild_index()
        self._persist_resume_to_disk(doc_id, filename, raw_text, chunks, file_bytes)

        logger.info(f"Loaded & indexed resume '{filename}' ({doc_id}) with {len(chunks)} chunks, {len(raw_text)} chars. Active scope set.")
        return self.get_status()

    def add_document(self, file_bytes: bytes, filename: str, doc_type: str = "Notes", doc_id: Optional[str] = None) -> Dict[str, Any]:
        """Add supplemental context document (e.g. cheat sheet, system design doc)."""
        d_id = doc_id or f"doc-{abs(hash(filename + str(time.time()))) % 100000}"
        raw_text = self.extract_text_from_file(file_bytes, filename)
        chunks = self._chunk_text(raw_text)

        self.documents[d_id] = {
            "id": d_id,
            "name": filename,
            "raw_text": raw_text,
            "chunks": chunks,
            "type": doc_type,
            "size": f"{max(1, len(file_bytes) // 1024)} KB",
            "words": len(raw_text.split()),
        }
        self._rebuild_index()

        logger.info(f"Added document '{filename}' ({d_id}) with {len(chunks)} chunks.")
        return self.get_status()

    def delete_resume_fully(self, resume_id: str) -> bool:
        """
        Complete Cascade Deletion:
        1. Purges all vector embeddings associated with resume_id from memory/index.
        2. Deletes physical profile JSON, index JSON, and embeddings from disk.
        3. Resets active session memory if the deleted resume was currently active.
        """
        existed_in_memory = resume_id in self.resumes
        if existed_in_memory:
            del self.resumes[resume_id]

        if self.active_resume_id == resume_id:
            self.active_resume_id = next(iter(self.resumes.keys())) if self.resumes else None
            logger.info(f"Active resume unbinded. New active resume: {self.active_resume_id}")

        paths_to_delete = [
            os.path.join(self.resumes_dir, f"{resume_id}_profile.json"),
            os.path.join(self.resumes_dir, f"{resume_id}_index.json"),
            os.path.join(self.resumes_dir, f"{resume_id}_embeddings.npy"),
            f"core-engine/data/resumes/{resume_id}_profile.json",
            f"core-engine/data/resumes/{resume_id}_index.json",
            f"core-engine/data/resumes/{resume_id}_embeddings.npy",
            f"data/resumes/{resume_id}_profile.json",
            f"data/resumes/{resume_id}_index.json",
            f"data/resumes/{resume_id}_embeddings.npy",
        ]

        deleted_any_file = False
        for path in set(paths_to_delete):
            if os.path.exists(path):
                try:
                    os.remove(path)
                    deleted_any_file = True
                    logger.info(f"Cascade deleted physical file: {path}")
                except Exception as e:
                    logger.warning(f"Error deleting file {path}: {e}")

        self._rebuild_index()
        logger.info(f"Cascade deletion completed for resume '{resume_id}'.")
        return existed_in_memory or deleted_any_file

    def remove_resume(self, resume_id: str) -> bool:
        return self.delete_resume_fully(resume_id)

    def remove_document(self, doc_id: str) -> bool:
        if doc_id in self.documents:
            del self.documents[doc_id]
            self._rebuild_index()
            logger.info(f"Removed document '{doc_id}' and updated vector store.")
            return True
        return False

    def reset_all(self) -> Dict[str, Any]:
        """Completely purge all loaded resumes, documents, files, and vector stores."""
        resume_ids = list(self.resumes.keys())
        for r_id in resume_ids:
            self.delete_resume_fully(r_id)

        self.resumes.clear()
        self.documents.clear()
        self.active_resume_id = None
        self.job_description = ""
        self.vector_store.index([])
        logger.info("Purged all in-memory context and vector stores.")
        return self.get_status()

    def set_job_description(self, jd_text: str) -> Dict[str, Any]:
        self.job_description = jd_text.strip()
        logger.info(f"Updated Job Description ({len(self.job_description.split())} words).")
        return self.get_status()

    def retrieve_context(self, question: str, top_k: int = 3, active_resume_id: Optional[str] = None) -> str:
        """
        Convenience pass-through to retrieve context with strict active resume isolation.
        """
        from rag.retriever import retrieve_relevant_chunks
        target_resume_id = active_resume_id if active_resume_id is not None else self.active_resume_id
        return retrieve_relevant_chunks(question, active_resume_id=target_resume_id, top_k=top_k)

    def get_status(self) -> Dict[str, Any]:
        """Return loaded context metadata and active resume details."""
        active_res = self.resumes.get(self.active_resume_id) if self.active_resume_id else None
        return {
            "has_resume": len(self.resumes) > 0,
            "active_resume_id": self.active_resume_id,
            "resume_filename": active_res["name"] if active_res else None,
            "resume_chunks_count": len(active_res["chunks"]) if active_res else 0,
            "resumes_count": len(self.resumes),
            "documents_count": len(self.documents),
            "total_chunks": sum(len(r["chunks"]) for r in self.resumes.values()) + sum(len(d["chunks"]) for d in self.documents.values()),
            "has_job_description": bool(self.job_description),
            "jd_words": len(self.job_description.split()),
            "rag_backend": self.provider.get_provider_name(),
            "resumes": [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "size": r["size"],
                    "words": r["words"],
                    "chunks_count": len(r["chunks"]),
                    "is_active": r["id"] == self.active_resume_id
                }
                for r in self.resumes.values()
            ],
            "documents": [
                {"id": d["id"], "name": d["name"], "size": d["size"], "type": d["type"], "words": d["words"], "chunks_count": len(d["chunks"])}
                for d in self.documents.values()
            ],
        }


# Global context instance
context_manager = ContextManager()
