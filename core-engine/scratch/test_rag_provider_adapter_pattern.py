import asyncio
import os
import sys

# Ensure UTF-8 unbuffered output on Windows
sys.stdout.reconfigure(encoding='utf-8')

# Add core-engine root to python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.base import BaseRAGProvider
from rag.local_provider import LocalFAISSProvider
from rag.cloud_provider import CloudSaaSProvider
from rag.factory import get_rag_provider, set_rag_backend
from rag.context_manager import context_manager


async def test_rag_provider_architecture():
    print("==================================================================", flush=True)
    print("[TEST] RAG PROVIDER/ADAPTER PATTERN & MULTI-TENANT BACKENDS", flush=True)
    print("==================================================================", flush=True)

    # ── 1. Contract Verification on BaseRAGProvider ──
    print("\n--- 1. Testing BaseRAGProvider Subclasses Contract ---", flush=True)
    local_p = LocalFAISSProvider()
    cloud_p = CloudSaaSProvider()

    assert isinstance(local_p, BaseRAGProvider), "LocalFAISSProvider must inherit from BaseRAGProvider"
    assert isinstance(cloud_p, BaseRAGProvider), "CloudSaaSProvider must inherit from BaseRAGProvider"
    assert local_p.get_provider_name() == "local_faiss"
    assert cloud_p.get_provider_name() == "cloud_saas"
    print("[OK] Both Local and Cloud providers adhere to BaseRAGProvider interface contract.", flush=True)

    # ── 2. LocalFAISSProvider Multi-Tenant Scoping ──
    print("\n--- 2. Testing LocalFAISSProvider Tenant Isolation ---", flush=True)
    await local_p.clear_index("user_alpha")
    await local_p.clear_index("user_beta")

    chunks_alpha = [
        "Alice is a Staff Python & Distributed Systems Engineer with 10 years experience.",
        "Engineered real-time Kafka streaming platform handling 150k TPS."
    ]
    chunks_beta = [
        "Bob is a Senior Golang & Kubernetes Architect specialized in Raft consensus.",
        "Built cloud native microservices with sub-millisecond p99 gRPC latency."
    ]

    await local_p.build_index(chunks_alpha, "alice_resume.txt", user_id="user_alpha", metadata={"doc_id": "res-alice", "doc_type": "resume"})
    await local_p.build_index(chunks_beta, "bob_resume.txt", user_id="user_beta", metadata={"doc_id": "res-bob", "doc_type": "resume"})

    assert local_p.is_active("user_alpha") is True
    assert local_p.is_active("user_beta") is True
    assert local_p.is_active("user_gamma") is False

    # Retrieve for user_alpha -> MUST NOT contain Bob
    hits_alpha = await local_p.retrieve_top_k("consensus and microservices", top_k=3, user_id="user_alpha", active_resume_id="res-alice")
    print(f"User Alpha hits ({len(hits_alpha)}):", hits_alpha)
    for h in hits_alpha:
        assert "Alice" in h or "Kafka" in h
        assert "Bob" not in h
        assert "Golang" not in h

    # Retrieve for user_beta -> MUST NOT contain Alice
    hits_beta = await local_p.retrieve_top_k("Kafka streaming", top_k=3, user_id="user_beta", active_resume_id="res-bob")
    print(f"User Beta hits ({len(hits_beta)}):", hits_beta)
    for h in hits_beta:
        assert "Alice" not in h
        assert "150k TPS" not in h
        assert "Bob" in h or "microservices" in h or "Kubernetes" in h or "gRPC" in h

    print("[OK] LocalFAISSProvider tenant isolation passed with 0% leak.", flush=True)

    # ── 3. CloudSaaSProvider Multi-Tenant Stub ──
    print("\n--- 3. Testing CloudSaaSProvider Multi-Tenant Partitioning ---", flush=True)
    await cloud_p.clear_index("tenant_101")
    
    chunks_cloud = [
        "Charlie is a Cloud Infrastructure Engineer specialized in Terraform & AWS.",
        "Managed 500+ AWS ECS clusters with automated Canary rollouts."
    ]
    await cloud_p.build_index(chunks_cloud, "charlie_cloud.txt", user_id="tenant_101", metadata={"doc_id": "res-charlie", "doc_type": "resume"})
    assert cloud_p.is_active("tenant_101") is True

    hits_cloud = await cloud_p.retrieve_top_k("AWS ECS clusters", top_k=2, user_id="tenant_101", active_resume_id="res-charlie")
    print(f"Cloud Tenant 101 hits ({len(hits_cloud)}):", hits_cloud)
    assert len(hits_cloud) > 0
    assert "Charlie" in hits_cloud[0]

    # Test tenant purge
    await cloud_p.clear_index("tenant_101")
    assert cloud_p.is_active("tenant_101") is False
    print("[OK] CloudSaaSProvider tenant indexing and purge passed.", flush=True)

    # ── 4. Factory & Dynamic Switching ──
    print("\n--- 4. Testing Factory & RAG_STORAGE_BACKEND Switching ---", flush=True)
    
    # Switch to cloud
    provider_cloud = set_rag_backend("cloud")
    assert provider_cloud.get_provider_name() == "cloud_saas"
    assert get_rag_provider().get_provider_name() == "cloud_saas"
    print("[OK] Successfully switched active backend to 'cloud_saas'.")

    # Switch to local
    provider_local = set_rag_backend("local")
    assert provider_local.get_provider_name() == "local_faiss"
    assert get_rag_provider().get_provider_name() == "local_faiss"
    print("[OK] Successfully switched active backend to 'local_faiss'.")

    # Context manager status reports active backend
    status = context_manager.get_status()
    assert "rag_backend" in status
    print(f"[OK] Context status reports active backend: '{status['rag_backend']}'.")

    print("\n==================================================================", flush=True)
    print("[SUCCESS] ALL RAG PROVIDER & ADAPTER PATTERN TESTS PASSED!", flush=True)
    print("==================================================================", flush=True)


if __name__ == "__main__":
    asyncio.run(test_rag_provider_architecture())
