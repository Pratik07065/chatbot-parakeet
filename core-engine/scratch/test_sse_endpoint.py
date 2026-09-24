import os
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
from dotenv import load_dotenv
load_dotenv(env_path, override=True)
load_dotenv(override=True)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import json
import httpx
from main import app
from starlette.testclient import TestClient

SAMPLE_OCR_TEXT = """
LeetCode 1. Two Sum
Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.
"""

def test_fast_endpoint_sse():
    client = TestClient(app)
    print("Testing POST /api/vision/solve-fast via TestClient...")
    
    response = client.post(
        "/api/vision/solve-fast",
        json={"extracted_text": SAMPLE_OCR_TEXT, "language_hint": "python", "provider": "groq"}
    )
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    lines = response.text.split("\n")
    tokens = []
    
    for line in lines:
        if line.startswith("data: "):
            try:
                data = json.loads(line[6:])
                if "token" in data:
                    tokens.append(data["token"])
                elif data.get("done"):
                    print("Received SSE 'done' event!")
            except Exception:
                pass

    full_output = "".join(tokens)
    print(f"SSE Output Length: {len(full_output)} chars")
    print(f"Sample: {full_output[:120]}...")
    assert len(full_output) > 20
    print("✅ SSE Endpoint Test PASSED successfully!")

if __name__ == "__main__":
    test_fast_endpoint_sse()
