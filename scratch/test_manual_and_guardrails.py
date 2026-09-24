import json
import time
import requests

BASE_URL = "http://127.0.0.1:8000"

def test_health():
    res = requests.get(f"{BASE_URL}/api/health", timeout=5)
    print("Health Status:", res.status_code, res.json().get("status"))
    assert res.status_code == 200

def test_empty_manual_question_guardrail():
    # Empty question should return 400
    res = requests.post(
        f"{BASE_URL}/api/generate/manual",
        json={"question": "   ", "provider": "groq"},
        timeout=5
    )
    print("Empty Question Response Status:", res.status_code)
    assert res.status_code == 400, f"Expected 400, got {res.status_code}"
    print("Empty question guardrail verified.")

def test_manual_question_sse_stream():
    # Test valid manual question
    print("Sending manual question 'What is Python'...")
    res = requests.post(
        f"{BASE_URL}/api/generate/manual",
        json={"question": "What is Python", "provider": "groq"},
        stream=True,
        timeout=10
    )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    
    tokens = []
    for line in res.iter_lines():
        if line:
            decoded = line.decode('utf-8')
            if decoded.startswith('data: '):
                payload = json.loads(decoded[6:])
                if 'token' in payload:
                    tokens.append(payload['token'])
                elif payload.get('done'):
                    print("Stream completed successfully.")
    
    full_response = "".join(tokens)
    print(f"Received {len(tokens)} tokens.")
    assert len(tokens) > 0, "No tokens received from SSE manual question stream!"
    print("Manual question SSE stream verified.")

def test_session_clear():
    res = requests.post(f"{BASE_URL}/api/session/clear", timeout=5)
    print("Session Clear Status:", res.status_code, res.json())
    assert res.status_code == 200
    print("Session clear verified.")

if __name__ == "__main__":
    test_health()
    test_empty_manual_question_guardrail()
    test_manual_question_sse_stream()
    test_session_clear()
    print("\nALL BACKEND TESTS PASSED!")
