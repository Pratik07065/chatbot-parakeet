import asyncio
import datetime
import json
import logging
import os
import re
import sys
import time
from contextlib import asynccontextmanager
from typing import Dict, Any, List, Set, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, status, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv

from audio.capture import AudioCaptureEngine, get_audio_devices
from stt.deepgram_stream import DeepgramStreamManager, is_interview_question
from rag.context_manager import context_manager
from rag.retriever import retrieve_relevant_chunks, retrieve_raw_chunks
from llm.generator import answer_generator, is_resume_query
from llm.vision_solver import vision_solver
from llm.state_manager import active_session_context, active_code_context
from utils.profiler import LatencyProfiler


# Safe stdout logging with UTF-8 / replace fallback on Windows
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("parakeet-core")

# Load environment variables with override
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(dotenv_path=env_path, override=True)
load_dotenv(override=True)

SERVER_PORT = int(os.getenv("PORT", 8000))
SERVER_HOST = os.getenv("HOST", "127.0.0.1")
START_TIME = time.time()


class ConnectionManager:
    """Manages active WebSocket connections, telemetry broadcasting, and answer streaming."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.active_provider = "groq"
        self._current_gen_task: Optional[asyncio.Task] = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast JSON message to all connected clients."""
        if not self.active_connections:
            return

        payload = json.dumps(message)
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.debug(f"Error sending message to client: {e}")
                disconnected.add(connection)

        for dead_conn in disconnected:
            self.active_connections.discard(dead_conn)

    async def trigger_answer_stream(
        self,
        question: str,
        provider: Optional[str] = None,
        resume_id: Optional[str] = None,
    ):
        """Stream answer tokens directly across WebSocket with latency telemetry profiling."""
        clean_question = question.strip() if question else ""
        if not clean_question:
            return

        use_provider = provider or self.active_provider
        use_resume_id = resume_id if resume_id is not None else context_manager.active_resume_id
        profiler = LatencyProfiler()
        profiler.mark_speech_end()
        profiler.mark_stt_done()

        # Cancel any pending debounced auto-trigger if a manual/new trigger is invoked
        global pending_question_task
        if pending_question_task and not pending_question_task.done():
            pending_question_task.cancel()

        if self._current_gen_task and not self._current_gen_task.done():
            self._current_gen_task.cancel()

        async def _run_stream():
            try:
                # 1. Upstream Query Intent Classification: Only query RAG if personal/resume intent is matched
                retrieved_context = ""
                if is_resume_query(clean_question):
                    logger.info(f"===> [RAG CLASSIFIER]: Query='{clean_question}' | Intent=PERSONAL/RESUME -> Triggering RAG retrieval")
                    profiler.mark_rag_start()
                    retrieved_context = retrieve_relevant_chunks(clean_question, active_resume_id=use_resume_id)
                    profiler.mark_rag_done()
                else:
                    logger.info(f"===> [RAG CLASSIFIER]: Query='{clean_question}' | Intent=TECHNICAL/CONCEPTUAL -> Skipping RAG retrieval (0ms latency)")

                # 2. Profile LLM generation & stream tokens
                profiler.mark_llm_start()
                is_first = True
                accumulated_tokens = []

                def on_first_token():
                    profiler.mark_first_token()

                code_ctx = active_code_context.get_active_code()

                async for token in answer_generator.stream_answer(
                    question=clean_question,
                    context=retrieved_context,
                    provider=use_provider,
                    code_context=code_ctx,
                    on_first_token=on_first_token,
                ):
                    accumulated_tokens.append(token)
                    if is_first:
                        is_first = False
                        await self.broadcast({
                            "type": "answer_chunk",
                            "token": token,
                            "is_first": True,
                            "question": clean_question,
                            "provider": use_provider,
                            "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                        })
                    else:
                        await self.broadcast({
                            "type": "answer_chunk",
                            "token": token,
                            "is_first": False,
                            "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                        })


                # 3. Update session state context
                full_answer = "".join(accumulated_tokens)
                active_session_context.update_from_answer(clean_question, full_answer)

                # 4. Mark generation complete and compute telemetry SLA
                profiler.mark_llm_done()
                telemetry_metrics = profiler.compute_metrics(
                    provider=use_provider,
                    question_preview=clean_question,
                    rag_chunks_used=len(retrieved_context) if retrieved_context else 0,
                )

                await self.broadcast({
                    "type": "answer_chunk",
                    "token": "",
                    "is_done": True,
                    "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                })

                await self.broadcast({
                    "type": "telemetry",
                    "metrics": telemetry_metrics,
                    "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                })

            except asyncio.CancelledError:
                logger.info("Answer generation task cancelled by newer request.")
            except Exception as e:
                logger.error(f"Error during streaming answer generation: {e}")
                await self.broadcast({
                    "type": "error",
                    "message": f"Answer generation error: {str(e)}",
                    "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                })

        self._current_gen_task = asyncio.create_task(_run_stream())

    async def trigger_followup_stream(self, query: str, provider: Optional[str] = None):
        """
        Stream context-locked follow-up tokens directly across WebSocket,
        grounded in the active session problem & code.
        """
        clean_query = query.strip() if query else ""
        if not clean_query:
            return

        use_provider = provider or self.active_provider

        if self._current_gen_task and not self._current_gen_task.done():
            self._current_gen_task.cancel()

        async def _run_followup():
            try:
                is_first = True
                accumulated_tokens = []

                async for token in answer_generator.stream_followup_answer(
                    user_query=clean_query,
                    ctx=active_session_context,
                    provider=use_provider,
                ):
                    accumulated_tokens.append(token)
                    if is_first:
                        is_first = False
                        await self.broadcast({
                            "type": "answer_chunk",
                            "token": token,
                            "is_first": True,
                            "question": clean_query,
                            "provider": use_provider,
                            "is_followup": True,
                            "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                        })
                    else:
                        await self.broadcast({
                            "type": "answer_chunk",
                            "token": token,
                            "is_first": False,
                            "is_followup": True,
                            "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                        })

                full_answer = "".join(accumulated_tokens)
                active_session_context.update_from_answer(clean_query, full_answer)

                await self.broadcast({
                    "type": "answer_chunk",
                    "token": "",
                    "is_done": True,
                    "is_followup": True,
                    "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                })

            except asyncio.CancelledError:
                logger.info("Follow-up generation task cancelled.")
            except Exception as e:
                logger.error(f"Error during follow-up streaming: {e}")
                await self.broadcast({
                    "type": "error",
                    "message": f"Follow-up error: {str(e)}",
                    "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                })

        self._current_gen_task = asyncio.create_task(_run_followup())


# Global instances
ws_manager = ConnectionManager()
audio_engine = AudioCaptureEngine()
stt_manager = DeepgramStreamManager()

# Regex definitions for Inquiry Completeness Verification
DANGLING_ENDINGS_REGEX = re.compile(
    r"\b("
    r"is|are|was|were|be|been|being|"
    r"do|does|did|"
    r"have|has|had|"
    r"can|could|would|will|should|shall|may|might|must|"
    r"the|a|an|"
    r"of|to|for|with|in|on|at|by|from|about|into|through|during|before|after|above|below|between|"
    r"and|or|but|so|because|if|then|as|than|"
    r"your|my|our|their|his|her|its|"
    r"that|this|these|those|which|what|how|why|where|when|who|"
    r"like|um|uh|er|ah|you\s+know|"
    r"choose|explain|tell|describe|discuss|detail|elaborate|"
    r"(tell|show|give|ask)\s+(me|us)|"
    r"(can|could|would|will|do|does|did|have|has|are|were|should)\s+(you|we|i)|"
    r"(can|could|would|will|do|does|did|should)\s+(you|we|i)\s+(tell|explain|describe|show|give)|"
    r"(can|could|would|will|do|does|did|should)\s+(you|we|i)\s+(tell|show|give)\s+(me|us)"
    r")\s*[\.\,\-\…\?]*$",
    re.IGNORECASE
)

BARE_STARTER_REGEX = re.compile(
    r"^(what|why|how|when|where|who|which|whose|whom|"
    r"can\s+you|could\s+you|would\s+you|will\s+you|do\s+you|did\s+you|have\s+you|are\s+you|"
    r"explain|describe|tell\s+me|tell\s+me\s+about|walk\s+me\s+through|elaborate|clarify|"
    r"give\s+me|give\s+an\s+example|compare|difference\s+between)\s*[\.\,\-\…\?]*$",
    re.IGNORECASE
)


def is_semantically_complete_inquiry(text: str) -> bool:
    """
    Syntax and completeness verifier:
    Rejects bare starter prefixes (e.g. 'What is...', 'Can you...', 'Explain the...')
    and incomplete clauses ending with dangling auxiliaries, prepositions, or fillers.
    """
    if not text or not text.strip():
        return False
    cleaned = text.strip()
    cleaned_no_punct = re.sub(r"[\.\-\…]+$", "", cleaned).strip()
    if not cleaned_no_punct:
        return False

    # 1. Reject if ending with dangling words
    if DANGLING_ENDINGS_REGEX.search(cleaned_no_punct):
        return False

    # 2. Reject bare starter phrases
    from stt.deepgram_stream import FILLER_WORDS_REGEX
    norm = FILLER_WORDS_REGEX.sub("", cleaned_no_punct).strip()
    if BARE_STARTER_REGEX.match(norm):
        return False

    words = norm.split()
    word_count = len(words)

    # 3. Explicit question mark
    if cleaned.endswith("?"):
        return word_count >= 2

    # 4. Without '?', must match recognized interview intent and have sufficient substantive tokens (>= 3 words)
    if not is_interview_question(norm):
        return False

    return word_count >= 3


def extract_question_boundary(text: str) -> str:
    """Extract clean inquiry clause from conversational text, stripping banter and fillers."""
    if not text or not text.strip():
        return ""
    from stt.deepgram_stream import FILLER_WORDS_REGEX, INTERVIEW_INTENT_PATTERNS
    sentences = re.split(r"(?<=[.?!])\s+", text.strip())
    start_idx = None
    for idx, s in enumerate(sentences):
        if is_interview_question(s) or any(re.search(p, s.lower()) for p in INTERVIEW_INTENT_PATTERNS):
            start_idx = idx
            break

    if start_idx is not None:
        extracted = " ".join(sentences[start_idx:]).strip()
    else:
        extracted = text.strip()

    extracted = FILLER_WORDS_REGEX.sub("", extracted).strip()
    if extracted:
        extracted = extracted[0].upper() + extracted[1:]
    return extracted


class SlidingTranscriptBuffer:
    """
    In-memory rolling text window (last 45 seconds of conversation).
    Accumulates final transcription turns across natural mid-sentence pauses,
    tracks transient interim hypotheses, and automatically prunes stale turns.
    """
    def __init__(self, window_seconds: float = 45.0):
        self.window_seconds = window_seconds
        self.entries: List[Dict[str, Any]] = []
        self.interim_tail: str = ""
        self.last_update: float = 0.0

    def add_transcript(self, text: str, is_final: bool, timestamp: Optional[float] = None):
        now = timestamp or time.time()
        self.last_update = now
        clean_text = text.strip()
        if not clean_text:
            return

        if is_final:
            self.interim_tail = ""
            if not self.entries or self.entries[-1]["text"] != clean_text:
                self.entries.append({
                    "text": clean_text,
                    "timestamp": now,
                    "is_final": True
                })
        else:
            self.interim_tail = clean_text

        self._prune(now)

    def _prune(self, now: float):
        cutoff = now - self.window_seconds
        self.entries = [e for e in self.entries if e["timestamp"] >= cutoff]

    def get_rolling_text(self, include_interim: bool = True) -> str:
        self._prune(time.time())
        parts = [e["text"] for e in self.entries]
        if include_interim and self.interim_tail:
            parts.append(self.interim_tail)
        return " ".join(parts).strip()

    def get_recent_clause(self, window_seconds: float = 12.0) -> str:
        now = time.time()
        cutoff = now - window_seconds
        recent_parts = [e["text"] for e in self.entries if e["timestamp"] >= cutoff]
        if self.interim_tail:
            recent_parts.append(self.interim_tail)
        return " ".join(recent_parts).strip()

    def clear(self):
        self.entries.clear()
        self.interim_tail = ""


sliding_transcript_buffer = SlidingTranscriptBuffer(window_seconds=45.0)

# Question Auto-Answer Guardrails & 1.3s Debouncing
last_answered_question: str = ""
last_handled_question: str = ""  # Backward compatibility
last_handled_timestamp: float = 0.0
pending_question_task: Optional[asyncio.Task] = None
pending_question_text: str = ""

# Backward compatibility alias
is_probable_question = is_interview_question

# Direct audio websocket subscribers
active_audio_websockets: Set[WebSocket] = set()


async def _fire_question_trigger(q_text: str):
    """Confirm detected question, broadcast detection to frontend, and stream LLM answer."""
    global last_answered_question, last_handled_question, last_handled_timestamp, pending_question_task, pending_question_text
    cur_now = time.time()
    if q_text.lower() == last_answered_question.lower() and (cur_now - last_handled_timestamp) < 20.0:
        return
    if (cur_now - last_handled_timestamp) < 20.0 and q_text.lower() in last_answered_question.lower():
        return

    last_answered_question = q_text
    last_handled_question = q_text
    last_handled_timestamp = cur_now
    pending_question_task = None
    pending_question_text = ""

    # Broadcast question_detected event to frontend
    await ws_manager.broadcast({
        "type": "question_detected",
        "question": q_text,
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })

    logger.info(f"===> [Intent Confirmed]: '{q_text}' (Dispatching to LLM)")
    await ws_manager.trigger_answer_stream(q_text)


async def on_stt_event(event: Dict[str, Any]):
    global last_answered_question, last_handled_question, last_handled_timestamp, pending_question_task, pending_question_text

    # 1. Ultra-low latency forwarding: immediately broadcast every transcript chunk to all clients
    await ws_manager.broadcast(event)

    for audio_ws in list(active_audio_websockets):
        try:
            await audio_ws.send_json(event)
        except Exception:
            active_audio_websockets.discard(audio_ws)

    ev_type = event.get("type")
    if ev_type == "transcript":
        text = event.get("text", "").strip()
        is_final = bool(event.get("is_final"))
        speech_final = bool(event.get("speech_final"))
        now = time.time()

        sliding_transcript_buffer.add_transcript(text, is_final=is_final)

        # Interim results: already forwarded above to frontend in real time with zero delay.
        # Bypass backend regex extraction and queuing entirely for interim hypotheses.
        if not is_final or not text:
            return

        recent_clause = sliding_transcript_buffer.get_recent_clause(window_seconds=12.0)
        candidate_inquiry = extract_question_boundary(recent_clause)

        if is_semantically_complete_inquiry(candidate_inquiry):
            # Check for duplicate within 20 seconds
            if candidate_inquiry.lower() == last_answered_question.lower() and (now - last_handled_timestamp) < 20.0:
                logger.debug(f"Ignoring duplicate auto-question trigger: '{candidate_inquiry}'")
                return
            if (now - last_handled_timestamp) < 20.0 and candidate_inquiry.lower() in last_answered_question.lower():
                return

            # Cancel any previous pending debounce task if speaker continues or split phrases arrive
            if pending_question_task and not pending_question_task.done():
                pending_question_task.cancel()

            pending_question_text = candidate_inquiry

            # Fast-path: If Deepgram signaled speech_final (300ms endpointing elapsed),
            # trigger the Groq answer generator in an async non-blocking task immediately!
            if speech_final:
                logger.info(f"===> Deepgram speech_final=True confirmed: '{candidate_inquiry}' (Fast-dispatching Groq LLM)")
                pending_question_task = None
                pending_question_text = ""
                asyncio.create_task(_fire_question_trigger(candidate_inquiry))
                return

            # Fallback debounce for intermediate finalized phrases if speech_final has not arrived yet
            async def _debounced_trigger(q_text: str):
                try:
                    await asyncio.sleep(0.8)
                    await _fire_question_trigger(q_text)
                except asyncio.CancelledError:
                    pass

            pending_question_task = asyncio.create_task(_debounced_trigger(candidate_inquiry))

    elif ev_type == "utterance_end":
        # Deepgram VAD signaled utterance end (sustained post-speech silence)
        if pending_question_task and not pending_question_task.done() and pending_question_text:
            logger.info(f"Deepgram UtteranceEnd received; fast-path confirming question: '{pending_question_text}'")
            q_to_fire = pending_question_text
            pending_question_task.cancel()
            pending_question_task = None
            pending_question_text = ""
            asyncio.create_task(_fire_question_trigger(q_to_fire))


stt_manager.on_transcript_event = on_stt_event


class PipelineController:
    """Orchestrates hardware capture routing, Deepgram STT, and WebSocket broadcasting."""

    def __init__(self):
        self.is_active = False
        self.audio_source = "both"  # 'both' | 'system' | 'mic'
        self.mic_id: Optional[int] = None
        self.system_id: Optional[int] = None

    async def start(
        self,
        audio_source: str = "both",
        mic_id: Optional[int] = None,
        system_id: Optional[int] = None,
    ):
        self.audio_source = audio_source or "both"
        self.mic_id = mic_id
        self.system_id = system_id
        self.is_active = True

        logger.info(
            f"Starting Audio & STT Streaming Pipeline (Source: {self.audio_source}, "
            f"Mic ID: {self.mic_id}, Loopback ID: {self.system_id})..."
        )
        await audio_engine.start(
            mode=self.audio_source,
            mic_device_id=self.mic_id,
            loopback_device_id=self.system_id,
        )
        if not stt_manager.is_streaming:
            await stt_manager.start(audio_engine.audio_queue)

        loopback_status = audio_engine.get_loopback_status()
        await ws_manager.broadcast({
            "type": "system",
            "event": "pipeline_started",
            "audio_source": self.audio_source,
            "mic_id": self.mic_id,
            "system_id": self.system_id,
            "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
        })
        await ws_manager.broadcast({
            "type": "system_audio_status",
            **loopback_status,
            "audio_source": self.audio_source,
            "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
        })
        return {
            "status": "started",
            "active": True,
            "audio_source": self.audio_source,
            "mic_id": self.mic_id,
            "system_id": self.system_id,
            "loopback_status": loopback_status,
        }

    async def switch_audio_source(
        self,
        audio_source: str,
        mic_id: Optional[int] = None,
        system_id: Optional[int] = None,
    ):
        self.audio_source = audio_source
        self.mic_id = mic_id
        self.system_id = system_id

        logger.info(f"Switching audio source live to '{audio_source}'...")
        await audio_engine.switch_source(
            mode=audio_source,
            mic_device_id=mic_id,
            loopback_device_id=system_id,
        )
        loopback_status = audio_engine.get_loopback_status()
        await ws_manager.broadcast({
            "type": "system",
            "event": "audio_source_changed",
            "audio_source": self.audio_source,
            "mic_id": self.mic_id,
            "system_id": self.system_id,
            "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
        })
        await ws_manager.broadcast({
            "type": "system_audio_status",
            **loopback_status,
            "audio_source": self.audio_source,
            "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
        })
        return {
            "status": "success",
            "audio_source": self.audio_source,
            "mic_id": self.mic_id,
            "system_id": self.system_id,
            "loopback_status": loopback_status,
        }

    async def stop(self):
        if not self.is_active:
            return {"status": "already_stopped"}

        self.is_active = False
        logger.info("Stopping Audio & STT Streaming Pipeline...")
        await stt_manager.stop()
        await audio_engine.stop()
        await ws_manager.broadcast({
            "type": "system",
            "event": "pipeline_stopped",
            "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
        })
        await ws_manager.broadcast({
            "type": "system_audio_status",
            "loopback_active": False,
            "device_name": audio_engine.active_loopback_name,
            "sample_rate": audio_engine._loopback_native_rate,
            "channels": audio_engine._loopback_native_channels,
            "rms": 0.0,
            "is_active": False,
            "audio_source": self.audio_source,
            "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
        })
        return {"status": "stopped", "active": False}


pipeline = PipelineController()


async def _loopback_health_monitor():
    """
    Periodic diagnostic logger and telemetry broadcaster for Windows WASAPI loopback capture.
    Logs health every 2.5 seconds showing active device, sample rate, and current RMS amplitude.
    """
    last_log_time = 0.0
    while True:
        try:
            await asyncio.sleep(2.5)
            if pipeline.is_active and audio_engine.is_running and audio_engine.active_mode in ("both", "system"):
                status_data = audio_engine.get_loopback_status()
                if status_data.get("loopback_active"):
                    dev_name = status_data.get("device_name", "System Audio")
                    sr = status_data.get("sample_rate", 48000)
                    rms = status_data.get("rms", 0.0)
                    now = time.time()

                    if now - last_log_time >= 2.5:
                        last_log_time = now
                        if rms > 0.003:
                            logger.info(
                                f"[WASAPI Loopback] Capturing active output device: {dev_name} at {sr}Hz | "
                                f"[AUDIO ACTIVE] RMS: {rms:.4f}"
                            )
                        else:
                            logger.info(
                                f"[WASAPI Loopback] Capturing active output device: {dev_name} at {sr}Hz | "
                                f"RMS: {rms:.4f} (Idle/Listening)"
                            )

                    await ws_manager.broadcast({
                        "type": "system_audio_status",
                        **status_data,
                        "audio_source": pipeline.audio_source,
                        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                    })
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug(f"Loopback health monitor error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Parakeet Core Engine starting on http://{SERVER_HOST}:{SERVER_PORT} (Standby Mode - Audio pipeline will activate on session start)")
    health_task = asyncio.create_task(_loopback_health_monitor())
    yield
    health_task.cancel()
    try:
        await health_task
    except asyncio.CancelledError:
        pass
    logger.info("Parakeet Core Engine shutting down...")
    await pipeline.stop()


app = FastAPI(
    title="Parakeet AI - Core Engine",
    description="Real-Time Low-Latency Audio Streaming, Transcription & AI Assistant Core",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["General"])
async def root() -> Dict[str, Any]:
    return {
        "name": "Parakeet AI - Core Engine",
        "status": "online",
        "version": "0.1.0",
        "uptime_seconds": round(time.time() - START_TIME, 2),
        "pipeline_active": pipeline.is_active,
        "docs_url": "/docs",
    }


@app.get("/health", status_code=status.HTTP_200_OK, tags=["Health"])
@app.get("/api/health", status_code=status.HTTP_200_OK, tags=["Health"])
async def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "parakeet-core-engine",
        "timestamp": time.time(),
        "uptime_seconds": round(time.time() - START_TIME, 2),
        "pipeline_active": pipeline.is_active,
        "connected_clients": len(ws_manager.active_connections),
        "active_provider": ws_manager.active_provider,
        "context_status": context_manager.get_status(),
        "active_session_context": active_session_context.get_context_summary(),
        "providers": {
            "deepgram": bool(os.getenv("DEEPGRAM_API_KEY")),
            "groq": bool(os.getenv("GROQ_API_KEY")),
            "gemini": bool(os.getenv("GEMINI_API_KEY")),
            "openai": bool(os.getenv("OPENAI_API_KEY")),
        },
    }


# RAG Context Endpoints
@app.post("/api/context/upload", tags=["Context & RAG"])
async def upload_context(
    resume: Optional[UploadFile] = File(None),
    document: Optional[UploadFile] = File(None),
    doc_type: Optional[str] = Form("Notes"),
    doc_id: Optional[str] = Form(None),
    job_description: Optional[str] = Form(None),
) -> Dict[str, Any]:
    if resume:
        contents = await resume.read()
        context_manager.load_resume(contents, resume.filename or "resume.pdf", resume_id=doc_id)

    if document:
        contents = await document.read()
        context_manager.add_document(contents, document.filename or "document.txt", doc_type=doc_type or "Notes", doc_id=doc_id)

    if job_description is not None:
        context_manager.set_job_description(job_description)

    status_data = context_manager.get_status()
    await ws_manager.broadcast({
        "type": "system",
        "event": "context_updated",
        "context_status": status_data,
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    return {"status": "success", "context": status_data}


@app.get("/api/context/status", tags=["Context & RAG"])
@app.get("/api/context/documents", tags=["Context & RAG"])
async def get_context_status() -> Dict[str, Any]:
    return context_manager.get_status()


@app.delete("/api/context/documents/{document_id}", tags=["Context & RAG"])
async def delete_document(document_id: str) -> Dict[str, Any]:
    """
    Cascade delete document or resume by ID.
    Purges in-memory vector store, deletes on-disk profile/embeddings, and updates active scope.
    """
    removed = context_manager.remove_document(document_id)
    if not removed:
        removed = context_manager.delete_resume_fully(document_id)

    status_data = context_manager.get_status()
    await ws_manager.broadcast({
        "type": "system",
        "event": "context_updated",
        "context_status": status_data,
        "deleted_id": document_id,
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    return {
        "success": bool(removed),
        "deleted_id": document_id,
        "status": "success" if removed else "not_found",
        "context": status_data,
    }


@app.delete("/api/context/resumes/{resume_id}", tags=["Context & RAG"])
@app.delete("/api/context/resume", tags=["Context & RAG"])
async def delete_resume(resume_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Cascade delete resume by ID.
    Purges vector embeddings, deletes on-disk profile & index files, and unbinds active session.
    """
    if resume_id:
        removed = context_manager.delete_resume_fully(resume_id)
    else:
        resume_ids = list(context_manager.resumes.keys())
        removed = bool(resume_ids)
        for r_id in resume_ids:
            context_manager.delete_resume_fully(r_id)

    status_data = context_manager.get_status()
    await ws_manager.broadcast({
        "type": "system",
        "event": "context_updated",
        "context_status": status_data,
        "deleted_id": resume_id,
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    return {
        "success": bool(removed),
        "deleted_id": resume_id,
        "status": "success" if removed else "not_found",
        "context": status_data,
    }


@app.post("/api/context/activate-resume", tags=["Context & RAG"])
@app.post("/api/context/active-resume", tags=["Context & RAG"])
@app.post("/api/context/select-resume", tags=["Context & RAG"])
async def activate_resume(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """
    Activate and bind a specific resume for the session.
    Verifies context extraction and returns the confirmed active resume ID and context length.
    """
    resume_id = payload.get("resume_id") or payload.get("id")
    if not resume_id and payload.get("resume"):
        match = next((r_id for r_id, r in context_manager.resumes.items() if r["name"] == payload["resume"] or r_id == payload["resume"]), None)
        resume_id = match or payload["resume"]

    success = bool(context_manager.set_active_resume(resume_id))
    active_ctx = context_manager.get_active_context()
    logger.info(f"Active Resume ID set to '{resume_id}'. Context length: {len(active_ctx)} chars.")

    status_data = context_manager.get_status()
    await ws_manager.broadcast({
        "type": "system",
        "event": "active_resume_changed",
        "active_resume_id": context_manager.active_resume_id,
        "context_status": status_data,
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    return {
        "success": success,
        "active_resume_id": context_manager.active_resume_id,
        "context_length": len(active_ctx),
        "context": status_data,
    }


@app.post("/api/reset", tags=["Context & RAG"])
async def reset_all_data() -> Dict[str, Any]:
    global last_handled_question, last_handled_timestamp
    last_handled_question = ""
    last_handled_timestamp = 0.0
    active_session_context.clear()
    active_code_context.clear()
    status_data = context_manager.reset_all()
    await ws_manager.broadcast({
        "type": "system",
        "event": "data_reset",
        "context_status": status_data,
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    await ws_manager.broadcast({
        "type": "code_context_cleared",
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    return {"status": "success", "message": "All data, caches, and context purged", "context": status_data}


@app.post("/api/vision/solve-fast", tags=["Multimodal Vision"])
async def solve_fast_screen(payload: Dict[str, Any] = Body(...)):
    """
    Ultra-fast screen problem solver using local OCR extracted text.
    Streams SSE tokens back immediately with <300ms time-to-first-token.
    """
    extracted_text = payload.get("extracted_text", "").strip()
    if not extracted_text:
        raise HTTPException(status_code=400, detail="No readable text detected on screen")

    language_hint = payload.get("language_hint") or "python"
    provider = payload.get("provider", ws_manager.active_provider)

    logger.info(f"⚡ Fast Screen Solve request received ({len(extracted_text)} chars, Provider={provider}, Lang={language_hint})")

    async def event_generator():
        accumulated = []
        async for token in answer_generator.stream_coding_solution(
            extracted_text=extracted_text,
            language_hint=language_hint,
            provider=provider
        ):
            accumulated.append(token)
            yield f"data: {json.dumps({'token': token})}\n\n"

        full_solution = "".join(accumulated)

        try:
            # Extract problem title if structured
            problem_title = "On-Screen Coding Problem"
            title_match = re.search(r"💬\s*(?:Problem|Question):\s*([^\n]+)", full_solution, re.IGNORECASE)
            if title_match:
                problem_title = title_match.group(1).strip()
            elif extracted_text:
                problem_title = f"Problem: {extracted_text[:60]}..."

            # Update active code memory buffer and session state
            active_code_context.set_active_code(problem_title, full_solution, language=language_hint)
            active_session_context.update_from_answer(problem_title, full_solution)

            # Broadcast code context update to all active WebSocket clients
            await ws_manager.broadcast({
                "type": "code_context_updated",
                "has_code_context": True,
                "problem_title": problem_title,
                "language": language_hint,
                "solution_preview": full_solution[:150],
                "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
            })
        except Exception as e:
            logger.error(f"Error in post-stream fast solve handling: {e}")

        yield f"data: {json.dumps({'done': True, 'full_text': full_solution})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/api/vision/solve", tags=["Multimodal Vision"])
async def solve_vision_challenge(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    image_base64 = payload.get("image_base64", "")
    language_hint = payload.get("language_hint") or "Python" or "C++"

    logger.info("Received screenshot for Gemini Vision problem solving...")
    solution = await vision_solver.solve_problem(image_base64, language_hint)

    prob_title = solution.get("problem_summary") or "On-Screen Technical Challenge"
    sol_text = solution.get("solution_text") or solution.get("text") or ""

    # Update active code memory buffer and session context
    active_code_context.set_active_code(prob_title, sol_text, language=language_hint)
    active_session_context.update_from_vision_solution(solution)

    await ws_manager.broadcast({
        "type": "vision_solution",
        "solution": solution,
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })

    await ws_manager.broadcast({
        "type": "code_context_updated",
        "has_code_context": True,
        "problem_title": prob_title,
        "language": language_hint,
        "solution_preview": sol_text[:150],
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })

    return {"status": "success", "solution": solution}


@app.post("/api/generate/manual", tags=["LLM Copilot"])
async def generate_manual_question(payload: Dict[str, Any] = Body(...)):
    """
    Direct endpoint for manual chat questions and typed interview prompts.
    Streams SSE tokens back immediately and updates the active context.
    """
    question = payload.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    provider = payload.get("provider", ws_manager.active_provider)
    target_resume_id = payload.get("resume_id") or payload.get("active_resume_id") or context_manager.active_resume_id
    if is_resume_query(question):
        logger.info(f"===> [RAG CLASSIFIER]: Manual Query='{question[:50]}' | Intent=PERSONAL/RESUME -> Triggering RAG retrieval")
        context = retrieve_relevant_chunks(question, active_resume_id=target_resume_id)
    else:
        logger.info(f"===> [RAG CLASSIFIER]: Manual Query='{question[:50]}' | Intent=TECHNICAL/CONCEPTUAL -> Skipping RAG retrieval (0ms latency)")
        context = ""

    # Resolve active code context
    has_code_context = payload.get("has_code_context")
    if has_code_context is False:
        code_ctx = ""
    elif payload.get("code_context"):
        code_ctx = payload.get("code_context")
    else:
        code_ctx = active_code_context.get_active_code()

    logger.info(f"Generating manual response for question: '{question[:50]}' (Provider: {provider}, HasCodeContext: {bool(code_ctx)})")

    async def event_generator():
        accumulated = []
        async for token in answer_generator.stream_answer(
            question=question,
            context=context,
            provider=provider,
            code_context=code_ctx
        ):
            accumulated.append(token)
            yield f"data: {json.dumps({'token': token})}\n\n"

        full_text = "".join(accumulated)
        active_session_context.update_from_answer(question, full_text)
        yield f"data: {json.dumps({'done': True, 'full_text': full_text})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/generate/followup", tags=["LLM Copilot"])
async def generate_followup(payload: Dict[str, Any] = Body(...)):
    """
    Context-locked multi-turn follow-up (Pseudocode, Explanation, Dry Run, or Custom Question)
    strictly anchored to the active on-screen problem and code solution.
    """
    query = payload.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    provider = payload.get("provider", ws_manager.active_provider)

    # Optional override context from client if available
    override_ctx = payload.get("context")
    if override_ctx and isinstance(override_ctx, dict):
        if override_ctx.get("problem_title"):
            active_session_context.last_problem_title = override_ctx["problem_title"]
        if override_ctx.get("code_solution"):
            active_session_context.last_code_solution = override_ctx["code_solution"]
        if override_ctx.get("language"):
            active_session_context.last_language = override_ctx["language"]
        if override_ctx.get("intuition"):
            active_session_context.last_intuition = override_ctx["intuition"]
        if override_ctx.get("algorithm"):
            active_session_context.last_algorithm = override_ctx["algorithm"]

    async def event_generator():
        accumulated = []
        async for token in answer_generator.stream_followup_answer(
            user_query=query,
            ctx=active_session_context,
            provider=provider,
        ):
            accumulated.append(token)
            yield f"data: {json.dumps({'token': token})}\n\n"

        full_text = "".join(accumulated)
        active_session_context.update_from_answer(query, full_text)
        yield f"data: {json.dumps({'done': True, 'full_text': full_text})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/stt/simulate", tags=["Audio & STT"])
async def simulate_stt_question(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Manually trigger a simulated spoken question for testing."""
    question_text = payload.get("question", "").strip()
    if not question_text:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    asyncio.create_task(stt_manager.simulate_question_stream(question_text))
    return {"status": "success", "question": question_text}


@app.get("/api/session/active-context", tags=["Session Lifecycle"])
async def get_active_session_context() -> Dict[str, Any]:
    return active_session_context.get_context_summary()


@app.get("/api/session/active-code", tags=["Session Lifecycle"])
async def get_active_code_endpoint() -> Dict[str, Any]:
    """Inspect the short-term active code memory buffer."""
    summary = active_code_context.get_summary()
    return {
        **summary,
        "active_code": active_code_context.get_active_code(),
        "solution_raw": active_code_context.get_raw_solution(),
    }


@app.post("/api/session/active-code", tags=["Session Lifecycle"])
async def set_active_code_endpoint(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Manually set or update the active code memory buffer."""
    problem = payload.get("problem_title") or payload.get("problem") or "Active Problem"
    solution = payload.get("solution_code") or payload.get("solution") or ""
    language = payload.get("language", "python")
    active_code_context.set_active_code(problem, solution, language=language)
    summary = active_code_context.get_summary()
    await ws_manager.broadcast({
        "type": "code_context_updated",
        **summary,
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    return {"status": "success", "success": True, "active_code": summary, "summary": summary}


@app.delete("/api/session/active-code", tags=["Session Lifecycle"])
async def clear_active_code_endpoint() -> Dict[str, Any]:
    """Purge the active code memory buffer."""
    active_code_context.clear()
    await ws_manager.broadcast({
        "type": "code_context_cleared",
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    return {"status": "success", "success": True, "message": "Active code context cleared"}


@app.post("/api/session/clear", tags=["Session Lifecycle"])
async def clear_session_state() -> Dict[str, Any]:
    global last_handled_question, last_handled_timestamp
    last_handled_question = ""
    last_handled_timestamp = 0.0
    active_session_context.clear()
    active_code_context.clear()
    await ws_manager.broadcast({
        "type": "system",
        "event": "session_cleared",
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    await ws_manager.broadcast({
        "type": "code_context_cleared",
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    return {"status": "success", "message": "Active session context and code memory cleared"}



@app.get("/api/audio/devices", tags=["Audio & STT"])
async def get_available_audio_devices() -> Dict[str, Any]:
    devices = get_audio_devices()
    return {
        "inputs": devices.get("inputs", []),
        "outputs": devices.get("outputs", []),
        "active_mode": pipeline.audio_source,
        "active_mic_id": pipeline.mic_id,
        "active_system_id": pipeline.system_id,
    }


@app.post("/api/audio/route", tags=["Audio & STT"])
async def route_audio_source(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    audio_source = payload.get("audio_source", "both")
    mic_id = payload.get("mic_id")
    system_id = payload.get("system_id")
    return await pipeline.switch_audio_source(
        audio_source=audio_source,
        mic_id=mic_id,
        system_id=system_id,
    )


@app.post("/api/audio/start", tags=["Audio & STT"])
async def start_audio_pipeline(payload: Optional[Dict[str, Any]] = Body(None)) -> Dict[str, Any]:
    audio_source = "both"
    mic_id = None
    system_id = None
    if payload:
        audio_source = payload.get("audio_source", "both")
        mic_id = payload.get("mic_id")
        system_id = payload.get("system_id")
    return await pipeline.start(audio_source=audio_source, mic_id=mic_id, system_id=system_id)


@app.post("/api/audio/stop", tags=["Audio & STT"])
async def stop_audio_pipeline() -> Dict[str, Any]:
    return await pipeline.stop()


@app.get("/api/audio/status", tags=["Audio & STT"])
async def get_audio_status() -> Dict[str, Any]:
    return {
        "pipeline_active": pipeline.is_active,
        "audio_source": pipeline.audio_source,
        "mic_id": pipeline.mic_id,
        "system_id": pipeline.system_id,
        "deepgram_connected": stt_manager.is_streaming,
        "audio_capturing": audio_engine.is_running,
        "loopback_status": audio_engine.get_loopback_status(),
        "connected_clients": len(ws_manager.active_connections),
        "active_provider": ws_manager.active_provider,
    }


@app.post("/api/session/start", tags=["Session Lifecycle"])
async def start_session_endpoint(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    global last_handled_question, last_handled_timestamp
    last_handled_question = ""
    last_handled_timestamp = 0.0
    active_session_context.clear()

    company = payload.get("company", "Company")
    role = payload.get("role", "Role")
    provider = payload.get("provider", "groq")
    audio_source = payload.get("audio_source", "both")
    mic_id = payload.get("mic_id")
    system_id = payload.get("system_id")

    ws_manager.active_provider = provider
    if payload.get("jd"):
        context_manager.set_job_description(payload["jd"])

    if payload.get("resume_id"):
        context_manager.set_active_resume(payload["resume_id"])
    elif payload.get("resume"):
        match = next((r_id for r_id, r in context_manager.resumes.items() if r["name"] == payload["resume"] or r_id == payload["resume"]), None)
        context_manager.set_active_resume(match or payload["resume"])

    logger.info(f"Starting session for {company} - {role} (Provider: {provider}, Audio: {audio_source}, Active Resume: {context_manager.active_resume_id})")
    start_res = await pipeline.start(audio_source=audio_source, mic_id=mic_id, system_id=system_id)

    await ws_manager.broadcast({
        "type": "system",
        "event": "session_started",
        "session": payload,
        "active_resume_id": context_manager.active_resume_id,
        "context_status": context_manager.get_status(),
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    return {"status": "success", "pipeline": start_res, "active_resume_id": context_manager.active_resume_id}


@app.post("/api/session/end", tags=["Session Lifecycle"])
async def end_session_endpoint(payload: Optional[Dict[str, Any]] = Body(None)) -> Dict[str, Any]:
    global last_handled_question, last_handled_timestamp, last_answered_question
    last_handled_question = ""
    last_answered_question = ""
    last_handled_timestamp = 0.0
    active_session_context.clear()
    active_code_context.clear()
    sliding_transcript_buffer.clear()

    stop_res = await pipeline.stop()
    logger.info("Session ended. Audio pipeline stopped and buffers cleared.")

    await ws_manager.broadcast({
        "type": "system",
        "event": "session_ended",
        "summary": payload or {},
        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
    })
    return {"status": "success", "pipeline": stop_res}


@app.websocket("/ws/audio")
async def websocket_audio_endpoint(websocket: WebSocket):
    """
    Accepts raw binary 16kHz 16-bit linear PCM mono audio frames from Electron client (Microphone).
    Ingests into the audio mixer with WASAPI system loopback and streams to Deepgram live STT.
    Streams back real-time transcript events.
    """
    await websocket.accept()
    active_audio_websockets.add(websocket)
    logger.info(f"--> Audio PCM WebSocket connected from client. Active audio streams: {len(active_audio_websockets)}")

    if not pipeline.is_active:
        try:
            logger.info("Auto-starting pipeline on /ws/audio connection from active overlay...")
            await pipeline.start(audio_source=pipeline.audio_source)
        except Exception as e:
            logger.warning(f"Could not auto-start audio pipeline on ws connect: {e}")
    elif not stt_manager.is_streaming:
        try:
            await stt_manager.start(audio_engine.audio_queue)
        except Exception as e:
            logger.warning(f"Could not auto-start STT manager on audio ws connect: {e}")

    chunk_count = 0
    total_bytes = 0
    try:
        while True:
            pcm_bytes = await websocket.receive_bytes()
            if pcm_bytes:
                chunk_count += 1
                total_bytes += len(pcm_bytes)
                if chunk_count % 50 == 0:
                    logger.info(f"[Audio WS] Received {len(pcm_bytes)} bytes PCM (Chunk #{chunk_count}, Total: {total_bytes / 1024:.1f} KB)")
                # Ingest mic PCM into audio engine in-memory mixer
                audio_engine.push_mic_pcm(pcm_bytes)
    except WebSocketDisconnect:
        logger.info("--> Audio PCM WebSocket client disconnected.")
    except Exception as e:
        logger.debug(f"Audio WebSocket stream ended: {e}")
    finally:
        active_audio_websockets.discard(websocket)


@app.websocket("/ws/transcription")
async def websocket_transcription_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        await websocket.send_text(
            json.dumps({
                "type": "system",
                "event": "connected",
                "message": "Connected to Parakeet Real-Time STT & LLM Hub",
                "pipeline_active": pipeline.is_active,
                "active_provider": ws_manager.active_provider,
                "audio_source": pipeline.audio_source,
                "mic_id": pipeline.mic_id,
                "system_id": pipeline.system_id,
                "system_audio_status": audio_engine.get_loopback_status(),
                "context_status": context_manager.get_status(),
                "active_code_summary": active_code_context.get_summary(),
                "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
            })
        )

        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                action = msg.get("action") or msg.get("type")
                if action == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "timestamp": time.time()}))
                elif action == "start":
                    audio_source = msg.get("audio_source", pipeline.audio_source)
                    mic_id = msg.get("mic_id", pipeline.mic_id)
                    system_id = msg.get("system_id", pipeline.system_id)
                    await pipeline.start(audio_source=audio_source, mic_id=mic_id, system_id=system_id)
                elif action == "stop":
                    await pipeline.stop()
                elif action == "set_audio_source":
                    audio_source = msg.get("audio_source", "both")
                    mic_id = msg.get("mic_id")
                    system_id = msg.get("system_id")
                    await pipeline.switch_audio_source(audio_source=audio_source, mic_id=mic_id, system_id=system_id)
                elif action == "set_provider":
                    new_provider = msg.get("provider", "groq")
                    ws_manager.active_provider = new_provider
                    logger.info(f"Switched active LLM provider to: {new_provider}")
                elif action in ("activate_resume", "set_active_resume", "select_resume"):
                    target_res_id = msg.get("resume_id") or msg.get("id")
                    context_manager.set_active_resume(target_res_id)
                    await ws_manager.broadcast({
                        "type": "system",
                        "event": "active_resume_changed",
                        "active_resume_id": context_manager.active_resume_id,
                        "context_status": context_manager.get_status(),
                        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                    })
                elif action in ("generate", "manual_question", "trigger_manual", "shortcut_trigger", "answer"):
                    target_q = msg.get("question") or msg.get("text", "")
                    provider_override = msg.get("provider")
                    resume_override = msg.get("resume_id") or msg.get("active_resume_id")
                    logger.info(f"Manual generation triggered for: '{target_q}' (Resume: {resume_override})")
                    await ws_manager.trigger_answer_stream(target_q, provider_override, resume_id=resume_override)
                elif action == "followup":
                    target_query = msg.get("query", "")
                    provider_override = msg.get("provider")
                    logger.info(f"Follow-up generation triggered for: '{target_query}'")
                    await ws_manager.trigger_followup_stream(target_query, provider_override)
                elif action in ("clear_code_context", "clear_code"):
                    active_code_context.clear()
                    await ws_manager.broadcast({
                        "type": "code_context_cleared",
                        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                    })
                    logger.info("Active code context cleared via WebSocket action")
                elif action == "clear":
                    global last_handled_question, last_handled_timestamp, last_answered_question
                    last_handled_question = ""
                    last_answered_question = ""
                    last_handled_timestamp = 0.0
                    sliding_transcript_buffer.clear()
                    active_session_context.clear()
                    active_code_context.clear()
                    await ws_manager.broadcast({
                        "type": "code_context_cleared",
                        "timestamp": datetime.datetime.now().strftime("%I:%M:%S %p"),
                    })
                    logger.info("Active session and code context cleared via WebSocket action")
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket exception: {e}")
        ws_manager.disconnect(websocket)



if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=False,
        log_level="info",
    )
