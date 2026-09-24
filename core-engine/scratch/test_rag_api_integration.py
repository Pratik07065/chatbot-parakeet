import os
import sys
import json
from unittest.mock import AsyncMock, patch

# Add core-engine root to python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main
main.pipeline.start = AsyncMock(return_value={"status": "started"})
main.pipeline.stop = AsyncMock(return_value={"status": "stopped"})

from fastapi.testclient import TestClient
from main import app
from rag.context_manager import context_manager, RESUMES_DATA_DIR


def test_api_endpoints():
    print("==================================================================")
    print("[API TEST] TESTING FASTAPI RAG & CASCADE DELETION ENDPOINTS")
    print("==================================================================")

    with TestClient(app) as client:
        # 1. Reset
        res_reset = client.post("/api/reset")
        assert res_reset.status_code == 200
        print("[OK] Reset endpoint works.")

        # 2. Upload Resume 1
        resume_1_bytes = b"Dev 1 Python FastAPI distributed systems specialist."
        res_up1 = client.post(
            "/api/context/upload",
            files={"resume": ("dev1_resume.txt", resume_1_bytes, "text/plain")},
            data={"doc_id": "res-api-1"}
        )
        assert res_up1.status_code == 200
        assert res_up1.json()["context"]["has_resume"] is True
        print("[OK] Resume 1 uploaded with ID res-api-1.")

        # 3. Upload Resume 2
        resume_2_bytes = b"Dev 2 Go Kubernetes and Raft distributed consensus expert."
        res_up2 = client.post(
            "/api/context/upload",
            files={"resume": ("dev2_resume.txt", resume_2_bytes, "text/plain")},
            data={"doc_id": "res-api-2"}
        )
        assert res_up2.status_code == 200
        assert res_up2.json()["context"]["resumes_count"] == 2
        print("[OK] Resume 2 uploaded with ID res-api-2.")

        # 4. Verify disk persistence files exist
        assert os.path.exists(os.path.join(RESUMES_DATA_DIR, "res-api-1_profile.json"))
        assert os.path.exists(os.path.join(RESUMES_DATA_DIR, "res-api-2_profile.json"))
        print("[OK] Verified physical profile files on disk.")

        # 5. Switch active resume scope via /api/context/active-resume
        res_scope = client.post(
            "/api/context/active-resume",
            json={"resume_id": "res-api-1"}
        )
        assert res_scope.status_code == 200
        assert res_scope.json()["active_resume_id"] == "res-api-1"
        print("[OK] Switched active resume scope to res-api-1.")

        # 6. Delete Resume 1 via DELETE /api/context/documents/res-api-1
        res_del1 = client.delete("/api/context/documents/res-api-1")
        assert res_del1.status_code == 200
        del1_json = res_del1.json()
        assert del1_json["success"] is True
        assert del1_json["deleted_id"] == "res-api-1"
        assert not os.path.exists(os.path.join(RESUMES_DATA_DIR, "res-api-1_profile.json"))
        print("[OK] Cascade deletion via /api/context/documents/{id} passed.")

        # 7. Delete Resume 2 via DELETE /api/context/resumes/res-api-2
        res_del2 = client.delete("/api/context/resumes/res-api-2")
        assert res_del2.status_code == 200
        del2_json = res_del2.json()
        assert del2_json["success"] is True
        assert del2_json["deleted_id"] == "res-api-2"
        assert not os.path.exists(os.path.join(RESUMES_DATA_DIR, "res-api-2_profile.json"))
        print("[OK] Cascade deletion via /api/context/resumes/{id} passed.")

        print("\n==================================================================")
        print("[SUCCESS] ALL FASTAPI ENDPOINT INTEGRATION TESTS PASSED!")
        print("==================================================================")


if __name__ == "__main__":
    test_api_endpoints()
