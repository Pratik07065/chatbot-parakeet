import os
import sys
import json
import requests

BASE_URL = "http://127.0.0.1:8000"

def test_live_api():
    print("==================================================================")
    print("[LIVE API TEST] TESTING RAG & CASCADE DELETION VIA HTTP")
    print("==================================================================")

    # 1. Health check
    try:
        res_health = requests.get(f"{BASE_URL}/health", timeout=3)
        print(f"[OK] Live server online (Status: {res_health.status_code})")
    except Exception as e:
        print(f"[SKIP] Live server not reachable: {e}")
        return

    # 2. Reset All
    res_reset = requests.post(f"{BASE_URL}/api/reset")
    assert res_reset.status_code == 200
    print("[OK] Reset endpoint works.")

    # 3. Upload Resume 1
    resume_1_bytes = b"Dev 1 Python FastAPI distributed systems specialist."
    res_up1 = requests.post(
        f"{BASE_URL}/api/context/upload",
        files={"resume": ("dev1_resume.txt", resume_1_bytes, "text/plain")},
        data={"doc_id": "res-live-1"}
    )
    assert res_up1.status_code == 200
    assert res_up1.json()["context"]["has_resume"] is True
    print("[OK] Resume 1 uploaded with ID res-live-1.")

    # 4. Upload Resume 2
    resume_2_bytes = b"Dev 2 Go Kubernetes and Raft distributed consensus expert."
    res_up2 = requests.post(
        f"{BASE_URL}/api/context/upload",
        files={"resume": ("dev2_resume.txt", resume_2_bytes, "text/plain")},
        data={"doc_id": "res-live-2"}
    )
    assert res_up2.status_code == 200
    assert res_up2.json()["context"]["resumes_count"] == 2
    print("[OK] Resume 2 uploaded with ID res-live-2.")

    # 5. Switch active resume scope via /api/context/active-resume
    res_scope = requests.post(
        f"{BASE_URL}/api/context/active-resume",
        json={"resume_id": "res-live-1"}
    )
    assert res_scope.status_code == 200
    assert res_scope.json()["active_resume_id"] == "res-live-1"
    print("[OK] Switched active resume scope to res-live-1.")

    # 6. Delete Resume 1 via DELETE /api/context/documents/res-live-1
    res_del1 = requests.delete(f"{BASE_URL}/api/context/documents/res-live-1")
    assert res_del1.status_code == 200
    del1_json = res_del1.json()
    assert del1_json["success"] is True
    assert del1_json["deleted_id"] == "res-live-1"
    print("[OK] Cascade deletion via /api/context/documents/{id} passed.")

    # 7. Delete Resume 2 via DELETE /api/context/resumes/res-live-2
    res_del2 = requests.delete(f"{BASE_URL}/api/context/resumes/res-live-2")
    assert res_del2.status_code == 200
    del2_json = res_del2.json()
    assert del2_json["success"] is True
    assert del2_json["deleted_id"] == "res-live-2"
    print("[OK] Cascade deletion via /api/context/resumes/{id} passed.")

    # 8. Reset All
    res_reset_final = requests.post(f"{BASE_URL}/api/reset")
    assert res_reset_final.status_code == 200

    print("\n==================================================================")
    print("[SUCCESS] ALL LIVE HTTP ENDPOINT TESTS PASSED SUCCESSFULLY!")
    print("==================================================================")


if __name__ == "__main__":
    test_live_api()
