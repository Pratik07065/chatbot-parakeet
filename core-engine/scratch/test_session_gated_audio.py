import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient
from main import app, pipeline

def test_session_gated_audio():
    print("=== Testing Session-Gated Audio Pipeline Lifecycle ===")

    # Ensure pipeline is initially stopped (Standby mode)
    with TestClient(app) as client:
        # 1. Check audio status initially
        status_res = client.get("/api/audio/status")
        assert status_res.status_code == 200
        initial_status = status_res.json()
        print(f"Initial status: pipeline_active={initial_status.get('pipeline_active')}")
        assert initial_status.get("pipeline_active") is False, "Pipeline should be inactive on startup!"
        print("[PASS] Verified pipeline is in STANDBY mode on server startup (no audio captured before session).")

        # 2. Start session via /api/session/start
        session_payload = {
            "company": "Google",
            "role": "Staff Software Engineer",
            "provider": "groq",
            "audio_source": "both"
        }
        start_res = client.post("/api/session/start", json=session_payload)
        assert start_res.status_code == 200
        start_data = start_res.json()
        assert start_data["status"] == "success"
        print(f"Session started: pipeline_active={pipeline.is_active}")
        assert pipeline.is_active is True, "Pipeline should be ACTIVE after session start!"
        print("[PASS] Verified /api/session/start activates continuous audio capture.")

        # 3. End session via /api/session/end
        end_res = client.post("/api/session/end", json={"duration": "00:05:00"})
        assert end_res.status_code == 200
        end_data = end_res.json()
        assert end_data["status"] == "success"
        print(f"Session ended: pipeline_active={pipeline.is_active}")
        assert pipeline.is_active is False, "Pipeline should be INACTIVE after session end!"
        print("[PASS] Verified /api/session/end stops audio capture and returns to standby.")

if __name__ == "__main__":
    test_session_gated_audio()
    print("\nALL LIFECYCLE TESTS PASSED SUCCESSFULLY!")
