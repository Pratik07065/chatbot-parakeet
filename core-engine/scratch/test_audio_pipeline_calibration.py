import asyncio
import sys
import os
import numpy as np

# Add parent directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from audio.capture import AudioCaptureEngine
from stt.deepgram_stream import calculate_pcm_energy


async def test_audio_pipeline():
    print("--> 1. Instantiating AudioCaptureEngine...")
    engine = AudioCaptureEngine()
    
    print("--> 2. Starting audio engine in 'both' mode...")
    res = await engine.start(mode="both")
    print("    Start result:", res)
    assert engine.is_running, "Engine should be running"
    
    print("--> 3. Simulating incoming 16kHz PCM chunks from Electron downsampler...")
    # Generate 16kHz sine wave tone at 200 Hz (speech-like fundamental frequency)
    sr = 16000
    duration_s = 0.5  # 500 ms = 8000 samples
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    signal = 0.5 * np.sin(2 * np.pi * 200 * t)
    pcm_int16 = (signal * 32767.0).astype(np.int16)
    pcm_bytes = pcm_int16.tobytes()

    # Stream in chunks of 2048 bytes (1024 samples = 64ms)
    chunk_bytes_len = 2048
    num_chunks = len(pcm_bytes) // chunk_bytes_len
    
    for i in range(num_chunks):
        chunk = pcm_bytes[i * chunk_bytes_len : (i + 1) * chunk_bytes_len]
        engine.push_mic_pcm(chunk)
    
    print(f"--> Pushed {num_chunks} chunks ({len(pcm_bytes)} bytes) to engine.")
    
    # Allow buffer flush
    await asyncio.sleep(0.05)
    
    print(f"--> 4. Checking audio_queue size: {engine.audio_queue.qsize()} chunks available.")
    assert engine.audio_queue.qsize() > 0, "Queue should have received processed PCM chunks"
    
    total_received_bytes = 0
    while not engine.audio_queue.empty():
        out_chunk = await engine.audio_queue.get()
        total_received_bytes += len(out_chunk)
        energy = calculate_pcm_energy(out_chunk)
        # Verify chunk size is multiple of 2 bytes (16-bit) and non-zero energy
        assert len(out_chunk) % 2 == 0, "Chunk must be 16-bit aligned"
        assert energy > 0.0, "Energy should reflect input tone"
    
    print(f"--> 5. Total processed bytes received from queue: {total_received_bytes} bytes.")
    print(f"    Expected ~{len(pcm_bytes)} bytes. Preserved ratio: {total_received_bytes / len(pcm_bytes):.2f}")
    assert total_received_bytes >= len(pcm_bytes) * 0.85, "No significant buffer truncation should occur"
    
    await engine.stop()
    print("--> 6. Engine stopped successfully. All DSP tests passed!")


if __name__ == "__main__":
    asyncio.run(test_audio_pipeline())
