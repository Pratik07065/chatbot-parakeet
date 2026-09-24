import sys
import os
import math
import struct
import json

# Add core-engine to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient
from main import app, stt_manager

client = TestClient(app)

def generate_sine_wave_pcm(frequency=440.0, duration_seconds=0.5, sample_rate=16000):
    """Generate 16-bit mono 16kHz Linear PCM Sine wave frames."""
    num_samples = int(sample_rate * duration_seconds)
    pcm_bytes = bytearray()
    for i in range(num_samples):
        sample = math.sin(2.0 * math.pi * frequency * (i / sample_rate))
        int_sample = int(sample * 32767.0)
        pcm_bytes.extend(struct.pack("<h", int_sample))
    return bytes(pcm_bytes)

def test_audio_websocket_pcm_streaming():
    print("=== Testing /ws/audio Binary PCM Streaming & Transcript Receiving ===")
    
    # Generate 16kHz Int16 PCM audio
    sine_pcm = generate_sine_wave_pcm(440.0, 0.25, 16000)
    print(f"Generated {len(sine_pcm)} bytes of 16kHz mono linear16 PCM audio test frame.")
    
    with client.websocket_connect("/ws/audio") as ws_audio:
        print("[PASS] Successfully connected to /ws/audio WebSocket endpoint.")
        
        # Send binary PCM frame
        ws_audio.send_bytes(sine_pcm)
        print(f"[PASS] Successfully sent {len(sine_pcm)} binary PCM bytes to /ws/audio.")
        
        # Simulate an STT event emission
        test_event = {
            "type": "transcript",
            "text": "What is the time complexity of binary search?",
            "is_final": True,
            "speaker": "interviewer",
        }
        
        # Directly trigger stt_manager event
        import asyncio
        asyncio.run(stt_manager._emit_event(test_event))
        
        # Check if ws_audio receives the transcript event
        received_msg = ws_audio.receive_json()
        print(f"Received event from /ws/audio: {received_msg}")
        assert received_msg["type"] == "transcript"
        assert "binary search" in received_msg["text"]
        print("[PASS] Verified that /ws/audio receives transcript JSON events in real-time.")

def test_transcription_websocket_and_audio_coexistence():
    print("\n=== Testing Concurrent /ws/transcription & /ws/audio Subscriptions ===")
    
    with client.websocket_connect("/ws/transcription") as ws_trans:
        init_msg = ws_trans.receive_json()
        assert init_msg["type"] == "system"
        print("[PASS] /ws/transcription connected and initialized.")
        
        with client.websocket_connect("/ws/audio") as ws_audio:
            # Stream audio
            ws_audio.send_bytes(generate_sine_wave_pcm(880.0, 0.1, 16000))
            
            # Emit transcript
            test_event = {
                "type": "transcript",
                "text": "Explain quicksort in simple terms",
                "is_final": True,
                "speaker": "interviewer",
            }
            import asyncio
            asyncio.run(stt_manager._emit_event(test_event))
            
            # Both should receive it
            t_msg = ws_trans.receive_json()
            a_msg = ws_audio.receive_json()
            
            assert t_msg["text"] == "Explain quicksort in simple terms"
            assert a_msg["text"] == "Explain quicksort in simple terms"
            print("[PASS] Dual subscription verified: Both /ws/transcription and /ws/audio received live transcript.")

if __name__ == "__main__":
    test_audio_websocket_pcm_streaming()
    test_transcription_websocket_and_audio_coexistence()
    print("\nALL REAL-TIME AUDIO & STT PIPELINE TESTS PASSED WITH 100% SUCCESS! ✨")
