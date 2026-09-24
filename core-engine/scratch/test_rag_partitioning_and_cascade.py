import os
import sys
import json

# Add core-engine root to python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.context_manager import context_manager, InMemoryVectorStore, RESUMES_DATA_DIR
from rag.retriever import retrieve_relevant_chunks, retrieve_raw_chunks


def run_unit_tests():
    print("==================================================================")
    print("[TEST] RUNNING RAG ISOLATION, PARTITIONING & CASCADE DELETION TESTS")
    print("==================================================================")

    # Clean slate
    context_manager.reset_all()

    # 1. Test Multiple Resumes Ingestion
    resume_1_text = b"""
    Alice Smith - Senior Python & Data Infrastructure Engineer
    Experience:
    - Built real-time event streaming pipeline processing 100,000 Kafka events per second using Python AsyncIO.
    - Reduced database load by 60% with Redis caching and PostgreSQL partitioning.
    - Developed internal ETL orchestration tools in Python and FastAPI.
    """

    resume_2_text = b"""
    Bob Jones - Principal Go & Cloud Native Engineer
    Experience:
    - Implemented Raft distributed consensus protocol from scratch in Golang.
    - Managed multi-cluster Kubernetes infrastructure across AWS and GCP with Terraform.
    - Optimized Golang gRPC microservices to achieve sub-millisecond p99 latency.
    """

    resume_3_text = b"""
    Charlie Vance - Staff Rust & Systems Programmer
    Experience:
    - Engineered high-frequency trading engine in Rust with zero heap allocations in the hot path.
    - Developed custom memory-safe Linux kernel drivers in Rust.
    - Ported legacy C++ embedded algorithms to Rust on ARM Cortex-M processors.
    """

    doc_text = b"""
    System Design Cheat Sheet
    Key Architecture Concepts:
    - CAP Theorem: Consistency, Availability, Partition Tolerance trade-offs.
    - Horizontal vs Vertical scaling strategies for relational databases.
    """

    print("\n--- 1. Loading & Tagging Multiple Resumes ---")
    context_manager.load_resume(resume_1_text, "Alice_Python_Resume.txt", resume_id="res-alice")
    context_manager.load_resume(resume_2_text, "Bob_Go_Resume.txt", resume_id="res-bob")
    context_manager.load_resume(resume_3_text, "Charlie_Rust_Resume.txt", resume_id="res-charlie")
    context_manager.add_document(doc_text, "System_Design.txt", doc_type="Notes", doc_id="doc-system-design")

    # Verify records have metadata tags
    assert len(context_manager.resumes) == 3
    assert len(context_manager.documents) == 1
    for rec in context_manager.vector_store.records:
        assert "id" in rec
        assert "resume_id" in rec
        assert "text" in rec
        assert "embedding" in rec
    print(f"[OK] Indexed {len(context_manager.vector_store.records)} chunk records with metadata.")

    # 2. Verify Disk Persistence
    print("\n--- 2. Verifying Disk Persistence Files ---")
    for r_id in ["res-alice", "res-bob", "res-charlie"]:
        profile_path = os.path.join(RESUMES_DATA_DIR, f"{r_id}_profile.json")
        index_path = os.path.join(RESUMES_DATA_DIR, f"{r_id}_index.json")
        embeddings_path = os.path.join(RESUMES_DATA_DIR, f"{r_id}_embeddings.npy")
        assert os.path.exists(profile_path), f"Missing {profile_path}"
        assert os.path.exists(index_path), f"Missing {index_path}"
        assert os.path.exists(embeddings_path), f"Missing {embeddings_path}"

        with open(profile_path, "r", encoding="utf-8") as f:
            p_data = json.load(f)
            assert p_data["id"] == r_id
    print("[OK] All profile JSON, index JSON, and embeddings files verified on disk.")

    # 3. Test Strict Isolation for Alice (Python)
    print("\n--- 3. Testing Strict Search Isolation for Alice (res-alice) ---")
    context_manager.set_active_resume("res-alice")
    raw_alice = retrieve_raw_chunks("Tell me about your distributed systems, streaming, or consensus work", top_k=5)
    print(f"Alice search candidates retrieved: {len(raw_alice)}")
    for r in raw_alice:
        print(f"  - [{r['score']}] ({r['resume_id'] or r['doc_id']}): {r['text'][:60]}...")
        # Must only match Alice or Supplemental doc, NEVER Bob or Charlie
        assert r["resume_id"] in ("res-alice", None)
        assert "Golang" not in r["text"]
        assert "Raft" not in r["text"]
        assert "Rust" not in r["text"]
    print("[OK] Strict isolation passed: 0% cross-contamination from Bob or Charlie.")

    # 4. Test Strict Isolation for Bob (Go)
    print("\n--- 4. Testing Strict Search Isolation for Bob (res-bob) ---")
    context_manager.set_active_resume("res-bob")
    raw_bob = retrieve_raw_chunks("Tell me about your streaming and kernel development", top_k=5)
    print(f"Bob search candidates retrieved: {len(raw_bob)}")
    for r in raw_bob:
        print(f"  - [{r['score']}] ({r['resume_id'] or r['doc_id']}): {r['text'][:60]}...")
        # Must only match Bob or Supplemental doc, NEVER Alice or Charlie
        assert r["resume_id"] in ("res-bob", None)
        assert "Python" not in r["text"]
        assert "Kafka" not in r["text"]
        assert "Cortex-M" not in r["text"]
    print("[OK] Strict isolation passed for Bob.")

    # 5. Test Active Resume None (Zero private resume leakage)
    print("\n--- 5. Testing Active Resume = None (Zero Private Resume Leakage) ---")
    context_manager.set_active_resume(None)
    raw_none = retrieve_raw_chunks("Tell me about your experience and background", top_k=5)
    print(f"None search candidates retrieved: {len(raw_none)}")
    for r in raw_none:
        print(f"  - [{r['score']}] ({r['resume_id'] or r['doc_id']}): {r['text'][:60]}...")
        assert r["resume_id"] is None
        assert r["doc_type"] != "resume"
    print("[OK] Passed: No private resume chunks returned when active_resume is None.")

    # 6. Test Cascade Deletion of Bob (res-bob)
    print("\n--- 6. Testing Complete Cascade Deletion for Bob (res-bob) ---")
    bob_profile_path = os.path.join(RESUMES_DATA_DIR, "res-bob_profile.json")
    bob_index_path = os.path.join(RESUMES_DATA_DIR, "res-bob_index.json")
    bob_embeddings_path = os.path.join(RESUMES_DATA_DIR, "res-bob_embeddings.npy")

    assert os.path.exists(bob_profile_path)
    context_manager.delete_resume_fully("res-bob")

    # In-memory check
    assert "res-bob" not in context_manager.resumes
    assert not any(rec.get("resume_id") == "res-bob" for rec in context_manager.vector_store.records)

    # Disk check
    assert not os.path.exists(bob_profile_path), "File still exists on disk!"
    assert not os.path.exists(bob_index_path), "File still exists on disk!"
    assert not os.path.exists(bob_embeddings_path), "File still exists on disk!"
    print("[OK] Cascade deletion passed: memory purged and disk files deleted.")

    # 7. Final Clean Slate Check
    print("\n--- 7. Testing Reset All ---")
    context_manager.reset_all()
    assert len(context_manager.resumes) == 0
    assert len(context_manager.documents) == 0
    assert len(context_manager.vector_store.records) == 0
    print("[OK] Reset all passed: completely clean slate.")

    print("\n==================================================================")
    print("[SUCCESS] ALL RAG ISOLATION & CASCADE DELETION TESTS PASSED!")
    print("==================================================================")


if __name__ == "__main__":
    run_unit_tests()
