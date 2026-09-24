import logging
import os
from typing import Optional

from rag.base import BaseRAGProvider
from rag.local_provider import LocalFAISSProvider
from rag.cloud_provider import CloudSaaSProvider

logger = logging.getLogger("parakeet-rag")

# Singleton Provider Instances
_local_provider_instance: Optional[LocalFAISSProvider] = None
_cloud_provider_instance: Optional[CloudSaaSProvider] = None
_active_override_backend: Optional[str] = None


def get_rag_provider(backend_override: Optional[str] = None) -> BaseRAGProvider:
    """
    Factory function for obtaining the configured RAG Storage Provider.
    Switches dynamically via RAG_STORAGE_BACKEND environment variable ('local' | 'cloud').
    """
    global _local_provider_instance, _cloud_provider_instance, _active_override_backend

    target_backend = (
        backend_override
        or _active_override_backend
        or os.getenv("RAG_STORAGE_BACKEND", "local")
    ).lower().strip()

    if target_backend in ("cloud", "saas", "pinecone", "qdrant", "pgvector"):
        if _cloud_provider_instance is None:
            _cloud_provider_instance = CloudSaaSProvider()
        return _cloud_provider_instance
    else:
        # Default to local desktop FAISS/In-Memory provider ($0 cost, offline execution)
        if _local_provider_instance is None:
            _local_provider_instance = LocalFAISSProvider()
        return _local_provider_instance


def set_rag_backend(backend: str) -> BaseRAGProvider:
    """
    Dynamically switch the active RAG storage backend at runtime.
    """
    global _active_override_backend
    _active_override_backend = backend.lower().strip()
    logger.info(f"Dynamically switched active RAG backend to: '{_active_override_backend}'")
    return get_rag_provider()
