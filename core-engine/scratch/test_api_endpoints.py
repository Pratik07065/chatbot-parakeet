import sys
import os
import json

# Add core-engine to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient
from main import app, active_code_context

client = TestClient(app)

def test_api_active_code():
    print("=== Testing /api/session/active-code REST Endpoints via TestClient ===")
    
    # 1. Clear active code
    del_res = client.delete("/api/session/active-code")
    assert del_res.status_code == 200, f"DELETE failed: {del_res.text}"
    del_data = del_res.json()
    assert del_data["success"] is True
    print("[PASS] DELETE /api/session/active-code verified.")
    
    # 2. Check GET returns has_active_code: False
    get_res = client.get("/api/session/active-code")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["has_active_code"] is False, f"Expected False, got {get_data}"
    print("[PASS] GET (empty) verified.")
    
    # 3. POST new active code
    post_payload = {
        "problem_title": "Reverse Linked List",
        "solution_code": "def reverseList(head):\n    prev = None\n    curr = head\n    while curr:\n        nxt = curr.next\n        curr.next = prev\n        prev = curr\n        curr = nxt\n    return prev",
        "language": "python"
    }
    post_res = client.post("/api/session/active-code", json=post_payload)
    assert post_res.status_code == 200, f"POST failed: {post_res.text}"
    post_data = post_res.json()
    assert post_data["success"] is True
    assert post_data["summary"]["has_active_code"] is True
    assert post_data["summary"]["problem_title"] == "Reverse Linked List"
    print("[PASS] POST active-code verified.")
    
    # 4. GET returns active code
    get_res2 = client.get("/api/session/active-code")
    assert get_res2.status_code == 200
    get_data2 = get_res2.json()
    assert get_data2["has_active_code"] is True
    assert "Reverse Linked List" in get_data2["active_code"]
    print("[PASS] GET (populated) verified.")
    
    # 5. Test manual generation with has_code_context: True
    print("\n=== Testing /api/generate/manual streaming with has_code_context ===")
    gen_payload = {
        "question": "What is the time complexity of this reversed list solution?",
        "provider": "groq",
        "has_code_context": True
    }
    gen_res = client.post("/api/generate/manual", json=gen_payload)
    assert gen_res.status_code == 200
    
    tokens = []
    for line in gen_res.iter_lines():
        if line:
            decoded = line if isinstance(line, str) else line.decode("utf-8")
            if decoded.startswith("data: "):
                try:
                    payload = json.loads(decoded[6:])
                    if "token" in payload:
                        tokens.append(payload["token"])
                except Exception:
                    pass
                    
    answer = "".join(tokens)
    print(f"Generated Manual Answer Preview:\n{answer[:250]}...\n")
    assert len(answer) > 0, "Expected generated response"
    print("[PASS] /api/generate/manual with active code context verified successfully.")
    
    # 6. Test /api/generate/followup
    print("\n=== Testing /api/generate/followup ===")
    followup_payload = {
        "query": "Can you explain line by line how pointers are updated?",
        "provider": "groq"
    }
    f_res = client.post("/api/generate/followup", json=followup_payload)
    assert f_res.status_code == 200
    f_tokens = []
    for line in f_res.iter_lines():
        if line:
            decoded = line if isinstance(line, str) else line.decode("utf-8")
            if decoded.startswith("data: "):
                try:
                    payload = json.loads(decoded[6:])
                    if "token" in payload:
                        f_tokens.append(payload["token"])
                except Exception:
                    pass
    f_answer = "".join(f_tokens)
    print(f"Generated Followup Answer Preview:\n{f_answer[:250]}...\n")
    assert len(f_answer) > 0, "Expected followup response"
    print("[PASS] /api/generate/followup verified successfully.")

if __name__ == "__main__":
    test_api_active_code()
    print("\nALL FASTAPI REST AND STREAMING ENDPOINTS VERIFIED SUCCESSFULLY! ✨")
