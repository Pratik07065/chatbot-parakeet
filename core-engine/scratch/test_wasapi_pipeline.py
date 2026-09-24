import asyncio
import numpy as np
import time
import sys
import os
import logging
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("test-wasapi")

from audio.capture import AudioCaptureEngine, get_audio_devices

async def test_wasapi_pipeline():
    logger.info("=== STEP 1: Testing Device Enumeration ===")
    devices = get_audio_devices()
    inputs = devices.get("inputs", [])
    outputs = devices.get("outputs", [])
    logger.info(f"Enumerated {len(inputs)} inputs and {len(outputs)} outputs.")
    
    loopback_devs = [d for d in outputs if d.get("is_loopback")]
    logger.info(f"Found {len(loopback_devs)} loopback-capable output devices:")
    for d in loopback_devs:
        logger.info(f"  - [{d['id']}] {d['name']} (Native SR: {d.get('sample_rate')}Hz, Default: {d.get('default')})")
    assert len(outputs) > 0, "Expected at least one output device"

    logger.info("\n=== STEP 2: Starting AudioCaptureEngine in 'both' mode ===")
    engine = AudioCaptureEngine()
    start_result = await engine.start(mode="both")
    logger.info(f"Engine start result: {start_result}")
    assert engine.is_running, "Engine should be running"
    assert start_result["loopback_active"] is True, "WASAPI loopback should be active"

    status = engine.get_loopback_status()
    logger.info(f"Initial loopback status: {status}")
    assert status["loopback_active"] is True, "Loopback status should indicate active"

    logger.info("\n=== STEP 3: Streaming simulated candidate mic PCM while capturing loopback ===")
    # Simulate candidate speaking: 16kHz mono linear16 PCM (1000 samples @ 440Hz sine wave)
    t = np.linspace(0, 0.2, int(16000 * 0.2), endpoint=False)
    sine_wave = (np.sin(2 * np.pi * 440 * t) * 16000).astype(np.int16)
    mic_pcm_bytes = sine_wave.tobytes()

    received_chunks = []

    async def reader():
        start_t = time.time()
        while time.time() - start_t < 1.5:
            try:
                chunk = await asyncio.wait_for(engine.get_audio_chunk(), timeout=0.2)
                received_chunks.append(chunk)
            except asyncio.TimeoutError:
                pass

    reader_task = asyncio.create_task(reader())

    for _ in range(5):
        engine.push_mic_pcm(mic_pcm_bytes)
        await asyncio.sleep(0.1)

    await reader_task
    logger.info(f"Received {len(received_chunks)} chunks from audio_queue.")
    assert len(received_chunks) > 0, "audio_queue should produce chunks"

    logger.info("\n=== STEP 4: Checking real-time loopback metrics ===")
    updated_status = engine.get_loopback_status()
    logger.info(f"Updated loopback status: {updated_status}")
    logger.info(f"[WASAPI Loopback] Capturing active output device: {updated_status['device_name']} at {updated_status['sample_rate']}Hz | RMS: {updated_status['rms']:.5f}")

    logger.info("\n=== STEP 5: Testing clean stop ===")
    await engine.stop()
    assert not engine.is_running, "Engine should be stopped"
    final_status = engine.get_loopback_status()
    assert final_status["loopback_active"] is False, "Loopback should be inactive after stop"
    logger.info("Test completed successfully! All assertions passed.")

if __name__ == "__main__":
    asyncio.run(test_wasapi_pipeline())
