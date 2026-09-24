import asyncio
import logging
import math
import sys
import time
from typing import Optional, Tuple, Dict, Any, List

import numpy as np

logger = logging.getLogger("parakeet-audio")

# WASAPI Loopback via PyAudioWPatch (Windows native loopback)
try:
    import pyaudiowpatch as pyaudio
    HAS_PYAUDIOWPATCH = True
except Exception:
    try:
        import pyaudio
        HAS_PYAUDIOWPATCH = hasattr(pyaudio, "paWASAPI")
    except Exception:
        HAS_PYAUDIOWPATCH = False

# Sounddevice fallback
try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except Exception as e:
    HAS_SOUNDDEVICE = False
    logger.warning(f"sounddevice could not be loaded: {e}. Running in software-only audio mode.")

try:
    from scipy import signal as sp_signal
    HAS_SCIPY = True
except Exception:
    HAS_SCIPY = False


def get_audio_devices() -> Dict[str, List[Dict[str, Any]]]:
    """
    Enumerate all available physical and virtual audio devices on the host machine.
    - Microphone is captured directly by Electron/Web Audio API.
    - System loopback output is captured by Windows WASAPI via PyAudioWPatch or sounddevice.
    """
    inputs: List[Dict[str, Any]] = []
    outputs: List[Dict[str, Any]] = []

    # 1. Primary: Use PyAudioWPatch on Windows for accurate WASAPI loopback enumeration
    if HAS_PYAUDIOWPATCH and sys.platform == "win32":
        try:
            p = pyaudio.PyAudio()
            wasapi_info = None
            try:
                wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
            except Exception:
                pass

            wasapi_idx = wasapi_info["index"] if wasapi_info else None
            default_out_idx = wasapi_info["defaultOutputDevice"] if wasapi_info else None
            default_in_idx = wasapi_info["defaultInputDevice"] if wasapi_info else None

            default_out_name = ""
            if default_out_idx is not None:
                try:
                    default_out_name = p.get_device_info_by_index(default_out_idx).get("name", "")
                except Exception:
                    pass

            for i in range(p.get_device_count()):
                dev = p.get_device_info_by_index(i)
                host_api = dev.get("hostApi", 0)
                # Prioritize WASAPI devices to prevent duplicate MME/DirectSound entries
                if wasapi_idx is not None and host_api != wasapi_idx:
                    continue

                max_in = dev.get("maxInputChannels", 0)
                max_out = dev.get("maxOutputChannels", 0)
                name = dev.get("name", f"Device {i}")
                sr = int(dev.get("defaultSampleRate", 48000))
                is_loopback = dev.get("isLoopbackDevice", False)

                if max_in > 0 and not is_loopback:
                    inputs.append({
                        "id": i,
                        "name": name,
                        "channels": max_in,
                        "sample_rate": sr,
                        "default": (i == default_in_idx),
                        "host_api": host_api,
                    })

                if is_loopback or max_out > 0:
                    is_default = (
                        (i == default_out_idx)
                        or (is_loopback and bool(default_out_name) and default_out_name in name)
                    )
                    outputs.append({
                        "id": i,
                        "name": name,
                        "channels": max_in if is_loopback else max_out,
                        "sample_rate": sr,
                        "is_loopback": True,
                        "default": is_default,
                        "host_api": host_api,
                    })

            p.terminate()
            if inputs or outputs:
                return {"inputs": inputs, "outputs": outputs}
        except Exception as e:
            logger.debug(f"PyAudioWPatch enumeration failed, falling back to sounddevice: {e}")

    # 2. Secondary fallback: sounddevice
    if HAS_SOUNDDEVICE:
        try:
            devices = sd.query_devices()
            default_in, default_out = sd.default.device

            wasapi_host_api = None
            if sys.platform == "win32":
                for idx, api in enumerate(sd.query_hostapis()):
                    if "WASAPI" in api.get("name", "").upper():
                        wasapi_host_api = idx
                        break

            for idx, dev in enumerate(devices):
                host_api = dev.get("hostapi", 0)
                max_in = dev.get("max_input_channels", 0)
                max_out = dev.get("max_output_channels", 0)
                name = dev.get("name", f"Device {idx}")
                sr = int(dev.get("default_samplerate", 48000))

                if max_in > 0:
                    inputs.append({
                        "id": idx,
                        "name": name,
                        "channels": max_in,
                        "sample_rate": sr,
                        "default": (idx == default_in),
                        "host_api": host_api,
                    })

                if max_out > 0:
                    is_wasapi = (wasapi_host_api is not None and host_api == wasapi_host_api)
                    outputs.append({
                        "id": idx,
                        "name": name,
                        "channels": max_out,
                        "sample_rate": sr,
                        "is_loopback": is_wasapi or sys.platform != "win32",
                        "default": (idx == default_out),
                        "host_api": host_api,
                    })

            return {"inputs": inputs, "outputs": outputs}
        except Exception as e:
            logger.error(f"Error querying audio devices with sounddevice: {e}")

    # 3. Last-resort defaults
    return {
        "inputs": [{"id": 0, "name": "Default Microphone (Electron Web Audio)", "channels": 1, "default": True}],
        "outputs": [{"id": 0, "name": "Default System Audio Loopback", "channels": 2, "is_loopback": True, "default": True}],
    }


class AudioCaptureEngine:
    """
    Decoupled Audio Capture & In-Memory FIFO Mixer Engine:
    - Candidate Microphone: Captured exclusively by Electron Web Audio API (pre-calibrated to 16kHz linear16 PCM)
      and received via `/ws/audio`.
    - Interviewer Audio: Captured by Python via Windows WASAPI loopback (PyAudioWPatch / sounddevice)
      at native hardware sample rate (e.g. 48000Hz or 44100Hz stereo) and resampled to 16kHz mono int16 PCM.
    - Continuous Sample-Accurate FIFO Mixer: Slices exact 1024-sample chunks without dropping buffer remainders,
      applying soft limiting to prevent digital clipping when both parties speak simultaneously.
    """

    TARGET_SAMPLE_RATE = 16000
    TARGET_CHANNELS = 1
    CHUNK_SIZE = 1024  # 64ms chunks at 16kHz
    MAX_QUEUE_SIZE = 100

    def __init__(self, sample_rate: int = TARGET_SAMPLE_RATE):
        self.sample_rate = sample_rate
        self.audio_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=self.MAX_QUEUE_SIZE)
        self.is_running = False
        self.active_mode = "both"  # 'both' | 'system' | 'mic'
        self.active_loopback_id: Optional[int] = None
        self.active_loopback_name: str = "Default Audio Output"

        self._loopback_stream = None
        self._pa_instance = None
        self._loopback_native_rate = 48000
        self._loopback_native_channels = 2
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        # Real-time diagnostics & health metrics
        self._last_mic_time: float = 0.0
        self._last_loopback_time: float = 0.0
        self._last_loopback_rms: float = 0.0

        # Sample-accurate 1D FIFO mixing buffers (float32 [-1.0, 1.0] at 16kHz)
        self._mic_buffer: np.ndarray = np.array([], dtype=np.float32)
        self._loopback_buffer: np.ndarray = np.array([], dtype=np.float32)

    def _resample_mono(self, mono_audio: np.ndarray, orig_rate: int) -> np.ndarray:
        """
        Resample 1D float32 mono audio to TARGET_SAMPLE_RATE (16000Hz)
        using scipy.signal.resample_poly or linear interpolation without phase distortion.
        """
        if len(mono_audio) == 0 or orig_rate == self.TARGET_SAMPLE_RATE:
            return mono_audio.astype(np.float32)

        if HAS_SCIPY:
            gcd = math.gcd(self.TARGET_SAMPLE_RATE, orig_rate)
            up = self.TARGET_SAMPLE_RATE // gcd
            down = orig_rate // gcd
            return sp_signal.resample_poly(mono_audio, up, down).astype(np.float32)
        else:
            orig_len = len(mono_audio)
            target_len = int(orig_len * (self.TARGET_SAMPLE_RATE / orig_rate))
            return np.interp(
                np.linspace(0, orig_len, target_len, endpoint=False),
                np.arange(orig_len),
                mono_audio,
            ).astype(np.float32)

    def _push_pcm_bytes(self, pcm_int16: np.ndarray):
        """Push raw int16 PCM bytes to the async queue safely from audio threads."""
        if not self.is_running or self._loop is None or pcm_int16.size == 0:
            return

        raw_bytes = pcm_int16.tobytes()
        if self.audio_queue.full():
            try:
                self.audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass

        try:
            self._loop.call_soon_threadsafe(self.audio_queue.put_nowait, raw_bytes)
        except Exception as e:
            logger.debug(f"Could not push audio frame to queue: {e}")

    def _pyaudio_loopback_callback(self, in_data, frame_count, time_info, status):
        """
        Non-blocking stream callback for PyAudioWPatch WASAPI loopback.
        Ingests multi-channel float32 system audio, downmixes to mono,
        resamples to 16kHz, computes RMS amplitude, and routes to mixer/queue.
        """
        if not in_data or not self.is_running:
            return (None, pyaudio.paContinue if HAS_PYAUDIOWPATCH else 0)

        try:
            # 1. Unpack incoming multi-channel float32 buffer
            audio_data = np.frombuffer(in_data, dtype=np.float32)
            if self._loopback_native_channels > 1:
                audio_data = audio_data.reshape(-1, self._loopback_native_channels)
                # 2. Downmix multi-channel to mono
                mono_audio = np.mean(audio_data, axis=1)
            else:
                mono_audio = audio_data

            # 3. Resample from native rate (e.g., 48000Hz or 44100Hz) to target 16000Hz
            resampled_mono = self._resample_mono(mono_audio, self._loopback_native_rate)

            # 4. Compute RMS amplitude for diagnostics and health monitoring
            if len(resampled_mono) > 0:
                rms = float(np.sqrt(np.mean(resampled_mono ** 2)))
            else:
                rms = 0.0
            self._last_loopback_rms = rms
            self._last_loopback_time = time.time()

            # 5. Process audio based on mode
            if self.active_mode == "system":
                # System-only mode: clamp and push directly to queue
                pcm_int16 = (np.clip(resampled_mono, -1.0, 1.0) * 32767.0).astype(np.int16)
                self._push_pcm_bytes(pcm_int16)
            elif self.active_mode == "both":
                # Both mode: append to FIFO buffer and mix with candidate microphone
                if len(self._loopback_buffer) > 0:
                    self._loopback_buffer = np.concatenate([self._loopback_buffer, resampled_mono])
                else:
                    self._loopback_buffer = resampled_mono
                self._mix_and_flush()
        except Exception as e:
            logger.error(f"Error in PyAudio loopback callback: {e}")

        return (None, pyaudio.paContinue if HAS_PYAUDIOWPATCH else 0)

    def _sounddevice_loopback_callback(self, indata, frames, time_info, status):
        """Fallback callback for sounddevice loopback streams."""
        if not self.is_running or indata is None or len(indata) == 0:
            return

        try:
            if indata.ndim > 1 and indata.shape[1] > 1:
                mono_audio = np.mean(indata, axis=1)
            elif indata.ndim > 1:
                mono_audio = indata[:, 0]
            else:
                mono_audio = indata

            if mono_audio.dtype == np.int16:
                mono_audio = mono_audio.astype(np.float32) / 32768.0
            elif mono_audio.dtype in (np.float32, np.float64):
                mono_audio = mono_audio.astype(np.float32)

            resampled_mono = self._resample_mono(mono_audio, self._loopback_native_rate)

            if len(resampled_mono) > 0:
                rms = float(np.sqrt(np.mean(resampled_mono ** 2)))
            else:
                rms = 0.0
            self._last_loopback_rms = rms
            self._last_loopback_time = time.time()

            if self.active_mode == "system":
                pcm_int16 = (np.clip(resampled_mono, -1.0, 1.0) * 32767.0).astype(np.int16)
                self._push_pcm_bytes(pcm_int16)
            elif self.active_mode == "both":
                if len(self._loopback_buffer) > 0:
                    self._loopback_buffer = np.concatenate([self._loopback_buffer, resampled_mono])
                else:
                    self._loopback_buffer = resampled_mono
                self._mix_and_flush()
        except Exception as e:
            logger.error(f"Error in sounddevice loopback callback: {e}")

    def _mix_and_flush(self):
        """
        Sample-accurate FIFO mixer:
        Extracts exact 1024-sample blocks (64ms at 16kHz). Never discards buffer remainders.
        Applies soft headroom scaling to prevent digital clipping when both parties speak.
        """
        now = time.time()
        loopback_active = (self._loopback_stream is not None) and (now - self._last_loopback_time < 0.35)
        mic_active = (now - self._last_mic_time < 0.35)

        # 1. Synchronized mixing when both streams have accumulated audio
        while len(self._mic_buffer) >= self.CHUNK_SIZE and len(self._loopback_buffer) >= self.CHUNK_SIZE:
            mic_part = self._mic_buffer[:self.CHUNK_SIZE]
            self._mic_buffer = self._mic_buffer[self.CHUNK_SIZE:]
            sys_part = self._loopback_buffer[:self.CHUNK_SIZE]
            self._loopback_buffer = self._loopback_buffer[self.CHUNK_SIZE:]

            # Soft linear mixing with 3dB headroom
            mixed = (mic_part * 0.707) + (sys_part * 0.707)
            pcm_int16 = (np.clip(mixed, -1.0, 1.0) * 32767.0).astype(np.int16)
            self._push_pcm_bytes(pcm_int16)

        # 2. Flush microphone audio when loopback is inactive or silent
        if len(self._mic_buffer) >= self.CHUNK_SIZE and not loopback_active:
            while len(self._mic_buffer) >= self.CHUNK_SIZE:
                mic_chunk = self._mic_buffer[:self.CHUNK_SIZE]
                self._mic_buffer = self._mic_buffer[self.CHUNK_SIZE:]
                pcm_int16 = (np.clip(mic_chunk, -1.0, 1.0) * 32767.0).astype(np.int16)
                self._push_pcm_bytes(pcm_int16)

        # 3. Flush loopback audio when candidate mic is silent or inactive
        if len(self._loopback_buffer) >= self.CHUNK_SIZE and not mic_active:
            while len(self._loopback_buffer) >= self.CHUNK_SIZE:
                sys_chunk = self._loopback_buffer[:self.CHUNK_SIZE]
                self._loopback_buffer = self._loopback_buffer[self.CHUNK_SIZE:]
                pcm_int16 = (np.clip(sys_chunk, -1.0, 1.0) * 32767.0).astype(np.int16)
                self._push_pcm_bytes(pcm_int16)

        # 4. Drift prevention: Cap buffers at 500ms (8000 samples at 16kHz) to avoid latency lag
        max_safety_samples = self.TARGET_SAMPLE_RATE // 2
        if len(self._mic_buffer) > max_safety_samples:
            excess = len(self._mic_buffer) - max_safety_samples
            chunk = self._mic_buffer[:excess]
            self._mic_buffer = self._mic_buffer[excess:]
            pcm_int16 = (np.clip(chunk, -1.0, 1.0) * 32767.0).astype(np.int16)
            self._push_pcm_bytes(pcm_int16)

        if len(self._loopback_buffer) > max_safety_samples:
            excess = len(self._loopback_buffer) - max_safety_samples
            chunk = self._loopback_buffer[:excess]
            self._loopback_buffer = self._loopback_buffer[excess:]
            pcm_int16 = (np.clip(chunk, -1.0, 1.0) * 32767.0).astype(np.int16)
            self._push_pcm_bytes(pcm_int16)

    def push_mic_pcm(self, pcm_bytes: bytes):
        """
        Ingest raw 16kHz linear16 mono PCM bytes streamed from Electron Web Audio via `/ws/audio`.
        """
        if not self.is_running or not pcm_bytes:
            return

        self._last_mic_time = time.time()

        if self.active_mode == "system":
            return

        if self.active_mode == "mic" and self._loopback_stream is None:
            # Direct low-latency passthrough when loopback is not active
            if self.audio_queue.full():
                try:
                    self.audio_queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                self.audio_queue.put_nowait(pcm_bytes)
            except Exception:
                pass
            return

        # In 'both' mode: Convert calibrated 16kHz PCM bytes to float32 and append to FIFO buffer
        try:
            samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            if len(self._mic_buffer) > 0:
                self._mic_buffer = np.concatenate([self._mic_buffer, samples])
            else:
                self._mic_buffer = samples
            self._mix_and_flush()
        except Exception as e:
            logger.error(f"Error pushing mic PCM to mixer: {e}")

    def _start_wasapi_loopback(self, target_device_id: Optional[int] = None) -> bool:
        """
        Locate and initialize the Windows WASAPI loopback stream using native hardware parameters.
        Returns True if the stream started successfully.
        """
        # Strategy 1: PyAudioWPatch (Native WASAPI Loopback)
        if HAS_PYAUDIOWPATCH and sys.platform == "win32":
            try:
                p = pyaudio.PyAudio()
                self._pa_instance = p

                wasapi_info = None
                try:
                    wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
                except Exception as e:
                    logger.debug(f"WASAPI host API query error: {e}")

                if wasapi_info is None:
                    p.terminate()
                    self._pa_instance = None
                else:
                    wasapi_idx = wasapi_info["index"]
                    loopback_dev = None

                    # Collect all WASAPI loopback devices (Strict Acoustic Isolation: Exclude microphone & input devices)
                    MIC_KEYWORDS = ("microphone", "mic array", "line in", "input", "headset mic")
                    loopback_devices = []
                    for i in range(wasapi_info["deviceCount"]):
                        dev = p.get_device_info_by_host_api_device_index(wasapi_idx, i)
                        dev_name = dev.get("name", "").lower()
                        # Acoustic isolation: must be a loopback render endpoint and NOT a microphone/input
                        if (dev.get("isLoopbackDevice") or "loopback" in dev_name) and not any(kw in dev_name for kw in MIC_KEYWORDS):
                            loopback_devices.append(dev)

                    # 1. If explicit ID provided, check if it's a loopback device or matching output
                    if target_device_id is not None:
                        try:
                            req_dev = p.get_device_info_by_index(target_device_id)
                            if req_dev.get("isLoopbackDevice"):
                                loopback_dev = req_dev
                            else:
                                # Find loopback device corresponding to this output
                                match = next((d for d in loopback_devices if req_dev["name"] in d["name"]), None)
                                if match:
                                    loopback_dev = match
                        except Exception:
                            pass

                    # 2. If no target specified or match not found, resolve default WASAPI output
                    if loopback_dev is None and wasapi_info.get("defaultOutputDevice") is not None:
                        try:
                            default_out = p.get_device_info_by_index(wasapi_info["defaultOutputDevice"])
                            match = next((d for d in loopback_devices if default_out["name"] in d["name"]), None)
                            if match:
                                loopback_dev = match
                        except Exception:
                            pass

                    # 3. Fallback to first available loopback device
                    if loopback_dev is None and loopback_devices:
                        loopback_dev = loopback_devices[0]

                    if loopback_dev is not None:
                        dev_name = loopback_dev.get("name", "WASAPI Loopback")
                        dev_rate = int(loopback_dev.get("defaultSampleRate", 48000))
                        dev_channels = int(loopback_dev.get("maxInputChannels", 2))
                        dev_idx = loopback_dev["index"]

                        self.active_loopback_name = dev_name
                        self._loopback_native_rate = dev_rate
                        self._loopback_native_channels = dev_channels

                        logger.info(
                            f"[WASAPI Loopback] Initializing native loopback stream on '{dev_name}' "
                            f"(Index: {dev_idx}, Channels: {dev_channels}, Native Rate: {dev_rate}Hz)..."
                        )

                        # Open stream matching native hardware parameters exactly
                        stream = p.open(
                            format=pyaudio.paFloat32,
                            channels=dev_channels,
                            rate=dev_rate,
                            input=True,
                            input_device_index=dev_idx,
                            stream_callback=self._pyaudio_loopback_callback,
                            frames_per_buffer=self.CHUNK_SIZE * max(1, dev_rate // self.TARGET_SAMPLE_RATE),
                        )
                        stream.start_stream()
                        self._loopback_stream = stream
                        logger.info(
                            f"[WASAPI Loopback] Successfully started loopback capture: '{dev_name}' at {dev_rate}Hz."
                        )
                        return True
            except Exception as e:
                logger.warning(f"PyAudioWPatch WASAPI loopback start failed: {e}")
                if self._pa_instance:
                    try:
                        self._pa_instance.terminate()
                    except Exception:
                        pass
                    self._pa_instance = None
                self._loopback_stream = None

        # Strategy 2: sounddevice fallback
        if HAS_SOUNDDEVICE:
            try:
                wasapi_host_api = None
                if sys.platform == "win32":
                    for idx, api in enumerate(sd.query_hostapis()):
                        if "WASAPI" in api.get("name", "").upper():
                            wasapi_host_api = idx
                            break

                default_out = sd.query_devices(kind="output")
                target_sd_id = target_device_id
                if target_sd_id is None:
                    target_sd_id = default_out.get("index")

                if target_sd_id is not None:
                    dev_info = sd.query_devices(target_sd_id)
                    dev_rate = int(dev_info.get("default_samplerate", 48000))
                    dev_channels = min(2, max(1, dev_info.get("max_input_channels", 2) or dev_info.get("max_output_channels", 2)))
                    self.active_loopback_name = dev_info.get("name", "System Audio")
                    self._loopback_native_rate = dev_rate
                    self._loopback_native_channels = dev_channels

                    extra_settings = sd.WasapiSettings(exclusive=False, auto_convert=True) if sys.platform == "win32" else None
                    self._loopback_stream = sd.InputStream(
                        samplerate=dev_rate,
                        channels=dev_channels,
                        dtype="float32",
                        blocksize=self.CHUNK_SIZE * max(1, dev_rate // self.TARGET_SAMPLE_RATE),
                        callback=self._sounddevice_loopback_callback,
                        device=target_sd_id,
                        extra_settings=extra_settings,
                    )
                    self._loopback_stream.start()
                    logger.info(f"[WASAPI Loopback] Started loopback via sounddevice: '{self.active_loopback_name}' ({dev_rate}Hz).")
                    return True
            except Exception as e:
                logger.warning(f"sounddevice loopback start failed: {e}")
                self._loopback_stream = None

        return False

    async def start(
        self,
        mode: str = "both",
        mic_device_id: Optional[int] = None,
        loopback_device_id: Optional[int] = None,
    ):
        """
        Initialize and start the dual-audio pipeline.
        - Microphone is streamed directly from Electron over `/ws/audio`.
        - System loopback output is captured via native WASAPI loopback.
        """
        if self.is_running:
            await self.stop()

        self.is_running = True
        self.active_mode = mode or "both"
        self.active_loopback_id = loopback_device_id
        self._loop = asyncio.get_running_loop()
        self._mic_buffer = np.array([], dtype=np.float32)
        self._loopback_buffer = np.array([], dtype=np.float32)
        self._last_mic_time = 0.0
        self._last_loopback_time = 0.0
        self._last_loopback_rms = 0.0

        if self.active_mode in ("both", "system"):
            started = self._start_wasapi_loopback(loopback_device_id)
            if not started:
                logger.info("System loopback standby mode active (clean microphone capture running).")

        if self.active_mode == "mic":
            logger.info("Mic-only mode active (Microphone streamed from Electron).")

        return {
            "status": "started",
            "mode": self.active_mode,
            "loopback_active": self._loopback_stream is not None,
            "loopback_device": self.active_loopback_name,
            "sample_rate": self.sample_rate,
        }

    async def switch_source(
        self,
        mode: str,
        mic_device_id: Optional[int] = None,
        loopback_device_id: Optional[int] = None,
    ):
        """Dynamically switch audio input routing on the fly."""
        logger.info(f"Switching audio capture source to '{mode}' (Loopback ID: {loopback_device_id})...")
        await self.start(mode=mode, mic_device_id=mic_device_id, loopback_device_id=loopback_device_id)

    async def stop(self):
        """Stop loopback stream and reset buffers."""
        self.is_running = False

        if self._loopback_stream:
            try:
                if HAS_PYAUDIOWPATCH and hasattr(self._loopback_stream, "stop_stream"):
                    self._loopback_stream.stop_stream()
                    self._loopback_stream.close()
                elif hasattr(self._loopback_stream, "stop"):
                    self._loopback_stream.stop()
                    self._loopback_stream.close()
            except Exception as e:
                logger.debug(f"Error stopping loopback stream: {e}")
            self._loopback_stream = None

        if self._pa_instance:
            try:
                self._pa_instance.terminate()
            except Exception as e:
                logger.debug(f"Error terminating PyAudio instance: {e}")
            self._pa_instance = None

        self._mic_buffer = np.array([], dtype=np.float32)
        self._loopback_buffer = np.array([], dtype=np.float32)
        self._last_loopback_rms = 0.0

        # Drain queue
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        logger.info("Audio capture engine stopped.")

    async def get_audio_chunk(self) -> bytes:
        """Yield the next raw 16kHz PCM audio chunk."""
        return await self.audio_queue.get()

    def get_loopback_status(self) -> Dict[str, Any]:
        """Return real-time diagnostic status of the WASAPI loopback capture stream."""
        now = time.time()
        is_streaming = (self._loopback_stream is not None) and self.is_running
        recent_activity = is_streaming and (now - self._last_loopback_time < 0.5)
        has_audio = recent_activity and (self._last_loopback_rms > 0.001)

        return {
            "loopback_active": is_streaming,
            "device_name": self.active_loopback_name,
            "sample_rate": self._loopback_native_rate,
            "channels": self._loopback_native_channels,
            "rms": round(self._last_loopback_rms, 5),
            "is_active": has_audio,
            "mode": self.active_mode,
        }

    def get_status(self) -> Dict[str, Any]:
        """Return current capture status and active routing."""
        return {
            "is_running": self.is_running,
            "mode": self.active_mode,
            "loopback_id": self.active_loopback_id,
            "loopback_device": self.active_loopback_name,
            "hardware_available": HAS_PYAUDIOWPATCH or HAS_SOUNDDEVICE,
            "loopback_active": self._loopback_stream is not None,
            "sample_rate": self.TARGET_SAMPLE_RATE,
            "loopback_rms": round(self._last_loopback_rms, 5),
        }
