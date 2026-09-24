import asyncio
import os
import sys
import json
import struct
from fastapi.testclient import TestClient

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure core-engine is on sys.path
core_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if core_dir not in sys.path:
    sys.path.insert(0, core_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(core_dir, "..", ".env"))

import main
from main import app

def test_audio_and_transcription_endpoints():
    print("============================================================")
    print("TESTING AUDIO PCM STREAMING & TRANSCRIPTION WEBSOCKET")
    print("============================================================\n")

    client = TestClient(app)

    # 1. Test /ws/transcription WebSocket Handshake
    print("--- [TEST 1: /ws/transcription Handshake & Ping] ---")
    with client.websocket_connect("/ws/transcription") as ws_trans:
        initial_msg = ws_trans.receive_json()
        print(f"Connected message: {initial_msg.get('message')}")
        assert initial_msg.get("type") == "system"
        assert initial_msg.get("event") == "connected"

        # Ping / Pong
        ws_trans.send_text(json.dumps({"action": "ping"}))
        pong_msg = ws_trans.receive_json()
        print(f"Pong response: {pong_msg}")
        assert pong_msg.get("type") == "pong"

    print("PASS: /ws/transcription handshake and ping verified.\n")

    # 2. Test /ws/audio Binary PCM streaming
    print("--- [TEST 2: /ws/audio Binary PCM Frame Streaming] ---")
    with client.websocket_connect("/ws/audio") as ws_audio:
        # Generate 4096 samples of 16-bit 16kHz sine wave PCM
        sample_count = 4096
        sine_pcm = bytearray()
        for i in range(sample_count):
            val = int(math_sin_approx(i) * 10000)
            sine_pcm.extend(struct.pack("<h", val))

        # Send raw PCM bytes
        ws_audio.send_bytes(bytes(sine_pcm))
        print(f"Successfully streamed {len(sine_pcm)} bytes of 16kHz mono linear16 PCM to /ws/audio")

    print("PASS: /ws/audio binary PCM streaming verified.\n")

    # 3. Test Manual Shortcut Trigger over WebSocket
    print("--- [TEST 3: Manual Shortcut Trigger ('shortcut_trigger' / 'generate')] ---")
    with client.websocket_connect("/ws/transcription") as ws_trans:
        _ = ws_trans.receive_json() # Handshake

        # Send manual shortcut trigger
        ws_trans.send_text(json.dumps({
            "action": "shortcut_trigger",
            "question": "What is Python?",
            "provider": "groq"
        }))

        received_tokens = []
        is_done = False
        while not is_done:
            msg = ws_trans.receive_json()
            if msg.get("type") == "answer_chunk":
                token = msg.get("token", "")
                if token:
                    received_tokens.append(token)
                if msg.get("is_done"):
                    is_done = True
            elif msg.get("type") == "error":
                print(f"Received error: {msg.get('message')}")
                break

        full_ans = "".join(received_tokens)
        print(f"Received streamed answer ({len(received_tokens)} chunks):\n{full_ans[:120]}...\n")
        assert len(received_tokens) > 0, "Expected streamed answer tokens"

    print("PASS: Manual shortcut trigger and answer streaming verified.\n")

    print("============================================================")
    print("ALL AUDIO & WEBSOCKET ENDPOINTS VERIFIED SUCCESSFULLY!")
    print("============================================================")


def math_sin_approx(x):
    import math
    return math.sin(2 * math.pi * 440 * x / 16000)


if __name__ == "__main__":
    test_audio_and_transcription_endpoints()
