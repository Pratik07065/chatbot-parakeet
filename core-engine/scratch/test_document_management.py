import requests
import io
import time

BASE_URL = "http://127.0.0.1:8000"

def test_document_management():
    print("=== Testing Document & Resume Management APIs ===")

    # 1. Check Initial Status
    res = requests.get(f"{BASE_URL}/api/context/status")
    print(f"Initial status ({res.status_code}):", res.json())
    assert res.status_code == 200

    # 2. Upload a sample Resume (PDF/TXT)
    sample_resume_content = b"""
    John Doe - Staff Software Engineer
    Experience:
    - Designed and implemented real-time distributed stream processing architecture with 50,000 TPS.
    - Optimized memory footprint and reduced WebSocket latency by 45% using Rust and Python.
    - Led Kubernetes migration across 3 regions with zero downtime.
    Skills: Python, Go, Rust, React, Distributed Systems, WebSockets, Kafka.
    """
    files = {
        'resume': ('John_Doe_Staff_Resume.txt', sample_resume_content, 'text/plain')
    }
    data = {
        'doc_id': 'res-test-101'
    }
    res_upload = requests.post(f"{BASE_URL}/api/context/upload", files=files, data=data)
    print(f"Resume Upload ({res_upload.status_code}):", res_upload.json())
    assert res_upload.status_code == 200

    # 3. Upload a sample Document (System Design CheatSheet)
    sample_doc_content = b"""
    System Design Reference Guide - High Concurrency
    Key Concepts:
    - Consistent Hashing for cache nodes and distributed ring topology.
    - Write-Through Caching vs Write-Behind Caching trade-offs.
    - Rate Limiting algorithms: Token Bucket, Leaky Bucket, Sliding Window Log.
    """
    files_doc = {
        'document': ('System_Design_High_Concurrency.txt', sample_doc_content, 'text/plain')
    }
    data_doc = {
        'doc_type': 'System Design',
        'doc_id': 'doc-test-202'
    }
    res_doc_upload = requests.post(f"{BASE_URL}/api/context/upload", files=files_doc, data=data_doc)
    print(f"Document Upload ({res_doc_upload.status_code}):", res_doc_upload.json())
    assert res_doc_upload.status_code == 200

    # 4. Verify documents are listed
    res_list = requests.get(f"{BASE_URL}/api/context/documents")
    list_json = res_list.json()
    print(f"Documents List ({res_list.status_code}): {len(list_json.get('resumes', []))} resumes, {len(list_json.get('documents', []))} docs")
    assert any(r['id'] == 'res-test-101' for r in list_json.get('resumes', []))
    assert any(d['id'] == 'doc-test-202' for d in list_json.get('documents', []))

    # 5. Delete Resume
    res_del_res = requests.delete(f"{BASE_URL}/api/context/resumes/res-test-101")
    print(f"Delete Resume ({res_del_res.status_code}):", res_del_res.json())
    assert res_del_res.status_code == 200

    # 6. Delete Document
    res_del_doc = requests.delete(f"{BASE_URL}/api/context/documents/doc-test-202")
    print(f"Delete Document ({res_del_doc.status_code}):", res_del_doc.json())
    assert res_del_doc.status_code == 200

    # 7. Confirm vector store flushed and items removed
    res_final = requests.get(f"{BASE_URL}/api/context/documents")
    final_json = res_final.json()
    print(f"Final List ({res_final.status_code}):", final_json)
    assert not any(r['id'] == 'res-test-101' for r in final_json.get('resumes', []))
    assert not any(d['id'] == 'doc-test-202' for d in final_json.get('documents', []))

    print("\n>>> ALL DOCUMENT & RESUME MANAGEMENT TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    test_document_management()
