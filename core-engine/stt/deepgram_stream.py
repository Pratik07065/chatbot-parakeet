import array
import asyncio
import datetime
import json
import logging
import os
from typing import Callable, Optional, Dict, Any

logger = logging.getLogger("parakeet-deepgram")

try:
    from deepgram import (
        DeepgramClient,
        DeepgramClientOptions,
        LiveTranscriptionEvents,
        LiveOptions,
    )
    HAS_DEEPGRAM = True
except Exception as e:
    HAS_DEEPGRAM = False
    logger.warning(f"Deepgram SDK could not be loaded: {e}. Running in standby STT mode.")

import re

# Comprehensive Interview Intent Pattern Matching
INTERVIEW_INTENT_PATTERNS = [
    # 1. Interrogative Starters (Wh- questions)
    r"^(what|why|how|when|where|who|which|whose|whom)\b",
    # 2. Modal & Auxiliary Verbs (can you, could you, do you, have you, are you, should we, etc.)
    r"^(can|could|would|will|do|does|did|have|has|had|is|are|was|were|should)\s+(you|we|i)\b",
    # 3. Imperative & Command Prompts
    r"^(explain|describe|walk\s+me\s+through|tell\s+me\s+about|elaborate(\s+on)?|clarify|give\s+(an?\s+)?example|give\s+me|show\s+me|discuss|detail|highlight|summarize|compare|differentiate|differences?(\s+between)?|pros\s+and\s+cons(\s+of)?)\b",
    # 4. Experience & Competency Queries
    r"(your\s+experience|your\s+background|your\s+projects?|have\s+you\s+ever|how\s+did\s+you|experience\s+(in|with)|background\s+in|familiar\s+with|worked\s+on|knowledge\s+of)",
]

FILLER_WORDS_REGEX = re.compile(
    r"^(so|okay|ok|well|now|alright|um|uh|hey|and|then|yeah|listen|right|like)\s*[,.-]*\s*",
    re.IGNORECASE,
)


def is_interview_question(text: str) -> bool:
    """
    Comprehensive Interview Intent Detection:
    - Strips leading filler words ('so', 'okay', 'well', 'now', 'um', 'uh', etc.).
    - Matches interrogative, modal/auxiliary, imperative prompts, or experience checks.
    - Matches any utterance ending with an explicit question mark '?'.
    """
    if not text:
        return False

    raw_clean = text.strip()
    if not raw_clean:
        return False

    # Punctuation cue: ending with ?
    if raw_clean.endswith("?"):
        return True

    # Strip conversational filler prefixes
    cleaned = raw_clean.lower()
    cleaned = FILLER_WORDS_REGEX.sub("", cleaned).strip()

    # Minimum length threshold: must have at least 2 words
    words = cleaned.split()
    if len(words) < 2:
        return False

    for pattern in INTERVIEW_INTENT_PATTERNS:
        if re.search(pattern, cleaned, re.IGNORECASE):
            return True

    return False


def calculate_pcm_energy(pcm_bytes: bytes) -> float:
    """
    Fast RMS energy estimation for 16-bit 16kHz linear PCM audio buffer.
    Used for audio activity and noise floor monitoring.
    """
    if not pcm_bytes or len(pcm_bytes) < 4:
        return 0.0
    try:
        samples = array.array('h')
        samples.frombytes(pcm_bytes)
        if not samples:
            return 0.0
        # Subsample every 4th sample for high performance
        sub = samples[::4]
        sum_sq = sum(s * s for s in sub)
        mean_sq = sum_sq / len(sub)
        return mean_sq ** 0.5
    except Exception:
        return 0.0


class DeepgramStreamManager:
    """
    Real-time Deepgram Nova-2 streaming speech-to-text manager.
    Receives pre-calibrated 16kHz linear16 mono PCM audio frames and streams
    them to Deepgram WebSocket with automatic error recovery and event dispatching.
    """

    def __init__(self, api_key: Optional[str] = None, on_transcript_event: Optional[Callable[[Dict[str, Any]], Any]] = None):
        self.api_key = api_key or os.getenv("DEEPGRAM_API_KEY")
        self.on_transcript_event = on_transcript_event
        self.is_streaming = False
        self._dg_client = None
        self._dg_connection = None
        self._stream_task: Optional[asyncio.Task] = None
        self._drain_task: Optional[asyncio.Task] = None
        self._active_queue: Optional[asyncio.Queue] = None

    def _get_timestamp(self) -> str:
        return datetime.datetime.now().strftime("%I:%M:%S %p")

    async def _emit_event(self, event_data: Dict[str, Any]):
        """Emit structured event to registered callback handler."""
        if self.on_transcript_event:
            try:
                if asyncio.iscoroutinefunction(self.on_transcript_event):
                    await self.on_transcript_event(event_data)
                else:
                    self.on_transcript_event(event_data)
            except Exception as e:
                logger.error(f"Error executing transcript event callback: {e}")

    async def _drain_audio_queue(self, audio_source_queue: asyncio.Queue):
        """
        Continuously drain audio chunks from queue during standby mode,
        preventing queue lockup if Deepgram credentials are not set.
        """
        while self.is_streaming:
            try:
                chunk = await asyncio.wait_for(audio_source_queue.get(), timeout=0.5)
                audio_source_queue.task_done()
            except (asyncio.TimeoutError, asyncio.QueueEmpty):
                await asyncio.sleep(0.05)
            except asyncio.CancelledError:
                break

    async def simulate_question_stream(self, question_text: str):
        """
        Simulate streaming a question word-by-word on demand for verification testing.
        """
        if not self.is_streaming or not question_text:
            return

        words = question_text.strip().split()
        if len(words) < 3:
            return

        for i in range(1, len(words) + 1):
            if not self.is_streaming:
                break
            interim_text = " ".join(words[:i])
            is_final_step = (i == len(words))

            event = {
                "type": "transcript",
                "text": interim_text,
                "is_final": is_final_step,
                "speech_final": is_final_step,
                "speaker": "interviewer",
                "is_question": is_interview_question(interim_text),
                "timestamp": self._get_timestamp(),
                "confidence": 0.98 if is_final_step else 0.85,
            }
            await self._emit_event(event)
            await asyncio.sleep(0.06 if not is_final_step else 0.1)

        if self.is_streaming:
            await self._emit_event({
                "type": "utterance_end",
                "timestamp": self._get_timestamp(),
                "speaker": "interviewer",
            })

    async def send_audio(self, pcm_bytes: bytes):
        """Directly send raw 16kHz linear16 mono PCM bytes to active Deepgram stream."""
        if not self.is_streaming or not pcm_bytes:
            return

        if self._dg_connection:
            try:
                await self._dg_connection.send(pcm_bytes)
            except Exception as ex:
                logger.error(f"Error sending direct audio to Deepgram: {ex}")

    async def start(self, audio_source_queue: Optional[asyncio.Queue] = None):
        """Start Deepgram Nova-2 streaming connection or standby audio processor."""
        if self.is_streaming:
            return

        self.is_streaming = True
        self.api_key = self.api_key or os.getenv("DEEPGRAM_API_KEY")
        queue = audio_source_queue or asyncio.Queue()
        self._active_queue = queue

        if HAS_DEEPGRAM and self.api_key:
            try:
                config = DeepgramClientOptions(options={"keepalive": "true"})
                self._dg_client = DeepgramClient(self.api_key, config)
                self._dg_connection = self._dg_client.listen.asyncwebsocket.v("1")

                async def on_message(self_dg, result, **kwargs):
                    try:
                        sentence = result.channel.alternatives[0].transcript
                        if not sentence or not sentence.strip():
                            return

                        cleaned = sentence.strip()
                        is_final = bool(result.is_final)
                        speech_final = bool(result.speech_final)
                        confidence = result.channel.alternatives[0].confidence or 0.95

                        # Fast-path interim results: emit immediately without regex analysis delay
                        if not is_final:
                            event = {
                                "type": "transcript",
                                "text": cleaned,
                                "is_final": False,
                                "speech_final": False,
                                "speaker": "interviewer",
                                "is_question": False,
                                "timestamp": self._get_timestamp(),
                                "confidence": round(confidence, 2),
                            }
                            await self._emit_event(event)
                            return

                        is_question = is_interview_question(cleaned)

                        event = {
                            "type": "transcript",
                            "text": cleaned,
                            "is_final": is_final,
                            "speech_final": speech_final,
                            "speaker": "interviewer",
                            "is_question": is_question,
                            "timestamp": self._get_timestamp(),
                            "confidence": round(confidence, 2),
                        }
                        await self._emit_event(event)
                    except Exception as ex:
                        logger.error(f"Error parsing Deepgram message: {ex}")

                async def on_utterance_end(self_dg, utterance_end, **kwargs):
                    await self._emit_event({
                        "type": "utterance_end",
                        "timestamp": self._get_timestamp(),
                        "speaker": "interviewer",
                    })

                async def on_error(self_dg, error, **kwargs):
                    logger.error(f"Deepgram WebSocket Error: {error}")
                    await self._emit_event({
                        "type": "error",
                        "message": str(error),
                        "timestamp": self._get_timestamp(),
                    })

                self._dg_connection.on(LiveTranscriptionEvents.Transcript, on_message)
                self._dg_connection.on(LiveTranscriptionEvents.UtteranceEnd, on_utterance_end)
                self._dg_connection.on(LiveTranscriptionEvents.Error, on_error)

                options = LiveOptions(
                    model="nova-2",
                    language="en-US",
                    encoding="linear16",
                    sample_rate=16000,
                    channels=1,
                    interim_results=True,     # Stream words immediately while speaking
                    smart_format=True,        # Real-time punctuation and numbers
                    endpointing="300",        # Cut silence finalization delay to 300ms (Parakeet style)
                    utterance_end_ms="1000",  # Flush trailing buffer after 1 second of speech cessation
                    vad_events=True,
                )

                started = await self._dg_connection.start(options)
                if started:
                    logger.info("Connected to Deepgram Nova-2 WebSocket live stream.")

                    async def send_audio_loop():
                        consecutive_errors = 0
                        while self.is_streaming:
                            try:
                                chunk = await queue.get()
                                if self._dg_connection:
                                    await self._dg_connection.send(chunk)
                                queue.task_done()
                                consecutive_errors = 0
                            except asyncio.CancelledError:
                                break
                            except Exception as ex:
                                consecutive_errors += 1
                                logger.error(f"Error sending audio to Deepgram: {ex}")
                                if consecutive_errors > 5:
                                    logger.warning("Too many send failures; breaking audio loop to trigger reconnect.")
                                    break
                                await asyncio.sleep(0.1)

                    self._stream_task = asyncio.create_task(send_audio_loop())
                    return
                else:
                    logger.warning("Failed to start Deepgram live connection. Running in standby mode.")
            except Exception as e:
                logger.error(f"Exception initializing Deepgram client: {e}. Running in standby mode.")

        # Standby mode if Deepgram is unavailable or key not configured
        logger.info("Running in standby STT audio draining mode.")
        self._drain_task = asyncio.create_task(self._drain_audio_queue(queue))

    async def stop(self):
        """Stop Deepgram stream and release connections."""
        self.is_streaming = False

        if self._drain_task and not self._drain_task.done():
            self._drain_task.cancel()
            try:
                await self._drain_task
            except asyncio.CancelledError:
                pass
            self._drain_task = None

        if self._stream_task and not self._stream_task.done():
            self._stream_task.cancel()
            try:
                await self._stream_task
            except asyncio.CancelledError:
                pass
            self._stream_task = None

        if self._dg_connection:
            try:
                await self._dg_connection.finish()
            except Exception as e:
                logger.debug(f"Error finishing Deepgram connection: {e}")
            self._dg_connection = None

        logger.info("Deepgram stream stopped.")
