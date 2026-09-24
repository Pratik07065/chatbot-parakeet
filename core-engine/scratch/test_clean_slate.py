import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def test_clean_slate_and_reset():
    time.sleep(1) # wait for server startup
    print("[1] Testing GET /api/health...")
    r = requests.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200, f"Health check failed: {r.text}"
    health_data = r.json()
    print(f"Health OK: {health_data['service']}, uptime: {health_data['uptime_seconds']}s")

    print("[2] Testing GET /api/context/documents...")
    r = requests.get(f"{BASE_URL}/api/context/documents")
    assert r.status_code == 200, f"Context documents failed: {r.text}"
    doc_data = r.json()
    print("Initial context status:", json.dumps(doc_data, indent=2))
    assert doc_data["resumes_count"] == 0, f"Expected 0 resumes, got {doc_data['resumes_count']}"
    assert doc_data["documents_count"] == 0, f"Expected 0 documents, got {doc_data['documents_count']}"
    assert doc_data["total_chunks"] == 0, f"Expected 0 chunks, got {doc_data['total_chunks']}"
    assert doc_data["resumes"] == [], f"Expected empty resumes list"
    assert doc_data["documents"] == [], f"Expected empty documents list"

    print("[3] Testing POST /api/reset...")
    r = requests.post(f"{BASE_URL}/api/reset")
    assert r.status_code == 200, f"Reset endpoint failed: {r.text}"
    reset_data = r.json()
    print("Reset response:", json.dumps(reset_data, indent=2))
    assert reset_data["status"] == "success"
    assert reset_data["context"]["resumes_count"] == 0
    assert reset_data["context"]["documents_count"] == 0

    print("\n[SUCCESS] All clean-slate backend verification tests PASSED with 100% success!")

if __name__ == "__main__":
    test_clean_slate_and_reset()
