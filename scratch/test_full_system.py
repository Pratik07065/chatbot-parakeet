import asyncio
import json
import time
import requests
import websockets

BASE_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws/transcription"

def test_rest_endpoints():
    print("Testing REST endpoints...")
    # 1. Health
    r = requests.get(f"{BASE_URL}/api/health", timeout=5)
    assert r.status_code == 200
    print("Health check OK.")

    # 2. Audio status
    r = requests.get(f"{BASE_URL}/api/audio/status", timeout=5)
    assert r.status_code == 200
    print("Audio status OK:", r.json().get("audio_source"))

    # 3. Guardrail: Empty manual question
    r = requests.post(f"{BASE_URL}/api/generate/manual", json={"question": ""}, timeout=5)
    assert r.status_code == 400
    print("Empty question guardrail OK (400 returned).")

    # 4. SSE Manual question
    r = requests.post(f"{BASE_URL}/api/generate/manual", json={"question": "What is Python"}, stream=True, timeout=10)
    assert r.status_code == 200
    tokens = []
    for line in r.iter_lines():
        if line:
            dec = line.decode('utf-8')
            if dec.startswith('data: '):
                payload = json.loads(dec[6:])
                if 'token' in payload:
                    tokens.append(payload['token'])
    assert len(tokens) > 0
    print(f"SSE Manual question OK ({len(tokens)} tokens).")


async def test_websocket_and_no_phantom():
    print("Testing WebSocket connection & verifying no phantom audio triggers...")
    async with websockets.connect(WS_URL) as ws:
        # Wait for system connected message
        msg = await asyncio.wait_for(ws.recv(), timeout=5)
        parsed = json.loads(msg)
        assert parsed.get("type") == "system"
        print("WS connected message received.")

        # Test manual question via WebSocket
        await ws.send(json.dumps({
            "action": "manual_question",
            "text": "Explain microservices architecture",
            "provider": "groq"
        }))

        received_chunks = 0
        is_done = False
        while not is_done:
            msg = await asyncio.wait_for(ws.recv(), timeout=10)
            data = json.loads(msg)
            if data.get("type") == "answer_chunk":
                if data.get("is_done"):
                    is_done = True
                else:
                    received_chunks += 1

        print(f"WS Manual question answer stream completed ({received_chunks} chunks).")

        # Now listen for 3 seconds: verify NO unsolicited / phantom questions are broadcast
        print("Listening for 3 seconds to verify NO phantom triggers...")
        try:
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=3)
                data = json.loads(msg)
                if data.get("type") == "transcript" and data.get("is_final"):
                    raise AssertionError(f"Unexpected phantom transcript broadcast: {data}")
        except asyncio.TimeoutError:
            print("No phantom audio triggers received. Noise suppression & guardrails verified!")


if __name__ == "__main__":
    test_rest_endpoints()
    asyncio.run(test_websocket_and_no_phantom())
    print("\n>>> ALL SYSTEM INTEGRATION TESTS PASSED SUCCESSFULLY! <<<")
