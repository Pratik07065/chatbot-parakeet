import io
import json
import sys
import urllib.request

# Ensure UTF-8 stdout
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


def test_api_endpoints():
    base_url = "http://127.0.0.1:8000"
    print("=== Testing FastAPI Active Context & Follow-Up Endpoints ===")

    # 1. Health check
    req = urllib.request.Request(f"{base_url}/health")
    with urllib.request.urlopen(req) as response:
        health_data = json.loads(response.read().decode('utf-8'))
        print(f"Health check status: {health_data.get('status')}")
        assert health_data.get("status") == "ok"
        assert "active_session_context" in health_data

    # 2. Query active context
    req = urllib.request.Request(f"{base_url}/api/session/active-context")
    with urllib.request.urlopen(req) as response:
        ctx_data = json.loads(response.read().decode('utf-8'))
        print(f"Current Active Context: {ctx_data}")

    # 3. Post follow-up request to /api/generate/followup
    payload = {
        "query": "Write clean step-by-step pseudocode for this solution",
        "provider": "groq",
        "context": {
            "problem_title": "Valid Parentheses: Determine if input brackets are valid",
            "code_solution": "def isValid(s):\n    stack = []\n    mapping = {')': '(', '}': '{', ']': '['}\n    for c in s:\n        if c in mapping:\n            if not stack or stack.pop() != mapping[c]:\n                return False\n        else:\n            stack.append(c)\n    return not stack",
            "language": "python",
            "intuition": "Use a stack to match matching bracket pairs.",
            "algorithm": "1. Push opening brackets.\n2. Pop and match closing brackets."
        }
    }
    
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        f"{base_url}/api/generate/followup",
        data=data_bytes,
        headers={"Content-Type": "application/json"}
    )

    print("\nStreaming SSE response from /api/generate/followup:")
    chunks = []
    with urllib.request.urlopen(req) as response:
        for line_bytes in response:
            line = line_bytes.decode('utf-8').strip()
            if line.startswith("data: "):
                event_data = json.loads(line[6:])
                if event_data.get("token"):
                    chunks.append(event_data["token"])
                if event_data.get("done"):
                    print("[SSE Stream Completed]")

    full_response = "".join(chunks)
    print(f"Follow-up stream output:\n{full_response[:220]}...")
    assert len(full_response) > 0
    print("[API FOLLOW-UP STREAM PASSED]")

    # 4. Verify context was updated with the problem
    req = urllib.request.Request(f"{base_url}/api/session/active-context")
    with urllib.request.urlopen(req) as response:
        ctx_data = json.loads(response.read().decode('utf-8'))
        print(f"Updated Active Context: {ctx_data['problem_title']}")
        assert "Valid Parentheses" in ctx_data["problem_title"]

    # 5. Clear session context
    req = urllib.request.Request(f"{base_url}/api/session/clear", data=b"{}", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as response:
        clear_res = json.loads(response.read().decode('utf-8'))
        print(f"Clear status: {clear_res}")
        assert clear_res.get("status") == "success"

    print("\n>>> ALL API ENDPOINT TESTS PASSED SUCCESSFULLY! <<<")


if __name__ == "__main__":
    test_api_endpoints()
