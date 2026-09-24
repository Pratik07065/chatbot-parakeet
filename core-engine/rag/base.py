from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any


class BaseRAGProvider(ABC):
    """
    Abstract Base Class defining the contract for all RAG storage backends.
    Decouples LLM generation from storage and vector database implementations
    (e.g., Local in-memory FAISS vs. Multi-tenant Cloud pgvector/Pinecone/Qdrant).
    """

    @abstractmethod
    async def build_index(
        self,
        chunks: List[str],
        filename: str,
        user_id: str = "local_user",
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Embeds and indexes document chunks for a specific user.
        Must tag all chunks with user_id and metadata for strict tenant partitioning.
        """
        pass

    @abstractmethod
    async def retrieve_top_k(
        self,
        query: str,
        top_k: int = 4,
        user_id: str = "local_user",
        active_resume_id: Optional[str] = None
    ) -> List[str]:
        """
        Performs cosine similarity search strictly scoped to the user's vectors.
        Chunks from other users and non-active resumes must be strictly isolated.
        """
        pass

    @abstractmethod
    async def clear_index(
        self,
        user_id: str = "local_user",
        resume_id: Optional[str] = None
    ) -> bool:
        """
        Purges vectors and associated chunks for the user or a specific resume_id.
        """
        pass

    @abstractmethod
    def is_active(self, user_id: str = "local_user") -> bool:
        """
        Checks if the user has an active indexed document or resume.
        """
        pass

    @abstractmethod
    def get_provider_name(self) -> str:
        """
        Returns the identifier name of the RAG backend (e.g. 'local_faiss', 'cloud_saas').
        """
        pass
