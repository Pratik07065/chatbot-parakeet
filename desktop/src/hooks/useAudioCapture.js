import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * High-precision fractional box-averaging downsampler.
 * Correctly decimates any arbitrary hardware sample rate (e.g. 48000Hz or 44100Hz)
 * down to 16,000Hz mono Float32 without frequency shifting (chipmunk distortion)
 * or temporal compression.
 */
function downsampleTo16k(buffer, inputSampleRate, targetSampleRate = 16000) {
  if (!buffer || buffer.length === 0) return new Float32Array(0);
  if (inputSampleRate === targetSampleRate) return buffer;

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * useAudioCapture:
 * Microphone capture hook in Electron / Chromium frontend.
 * Captures user mic audio via Web Audio API, downsamples from hardware native rate
 * to strict 16kHz mono linear16 PCM, computes RMS level for UI meter,
 * and streams binary PCM frames directly to the backend at ws://127.0.0.1:8000/ws/audio.
 */
export const useAudioCapture = (onTranscriptReceived = null) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioStatus, setAudioStatus] = useState("Idle");

  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const isMountedRef = useRef(true);

  // Store callback in ref to prevent stale closures
  const onTranscriptRef = useRef(onTranscriptReceived);
  onTranscriptRef.current = onTranscriptReceived;

  const stopAudio = useCallback(() => {
    try {
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    } catch (e) {
      console.warn('[Audio] Cleanup error:', e);
    }
    if (isMountedRef.current) {
      setIsCapturing(false);
      setAudioLevel(0);
      setAudioStatus("Stopped");
    }
  }, []);

  const startAudio = useCallback(async () => {
    stopAudio();
    if (isMountedRef.current) {
      setAudioStatus("Connecting...");
    }

    try {
      // 1. Connect WebSocket to backend audio intake
      const ws = new WebSocket("ws://127.0.0.1:8000/ws/audio");
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[Audio] Connected to backend /ws/audio");
        if (isMountedRef.current) {
          setAudioStatus("Mic Live");
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "transcript" && typeof onTranscriptRef.current === 'function') {
            onTranscriptRef.current(data.text, data.is_final);
          }
        } catch (e) {
          console.error("[Audio] STT parse error:", e);
        }
      };

      ws.onerror = () => {
        if (isMountedRef.current) setAudioStatus("WS Error");
      };

      // 2. Request microphone stream with voice processing constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // 3. Initialize Web Audio Context (request 16kHz native rate or fallback to system rate)
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      let audioCtx;
      try {
        audioCtx = new AudioCtx({ sampleRate: 16000 });
      } catch {
        audioCtx = new AudioCtx();
      }
      audioCtxRef.current = audioCtx;
      const nativeRate = audioCtx.sampleRate || 48000;
      console.log(`[Audio] Web Audio Context running at sample rate: ${nativeRate}Hz (State: ${audioCtx.state})`);

      // Resume context if suspended (handling autoplay policy restrictions)
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
          console.log(`[Audio] AudioContext resumed successfully. State: ${audioCtx.state}`);
        } catch (resumeErr) {
          console.warn("[Audio] Context auto-resume blocked by autoplay policy. Awaiting user interaction.", resumeErr);
          const handleUserGesture = () => {
            if (audioCtx.state === "suspended") {
              audioCtx.resume().then(() => {
                console.log("[Audio] AudioContext resumed via user gesture.");
              });
            }
            window.removeEventListener("click", handleUserGesture);
            window.removeEventListener("keydown", handleUserGesture);
          };
          window.addEventListener("click", handleUserGesture, { once: true });
          window.addEventListener("keydown", handleUserGesture, { once: true });
        }
      }

      const source = audioCtx.createMediaStreamSource(stream);
      // 1024 samples at 16kHz = 64ms latency per frame
      const processor = audioCtx.createScriptProcessor(1024, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        // Prevent acoustic feedback: zero out output buffer so user doesn't hear their mic
        if (e.outputBuffer) {
          const outCh = e.outputBuffer.getChannelData(0);
          if (outCh) outCh.fill(0);
        }

        const input = e.inputBuffer.getChannelData(0);
        if (!input || input.length === 0) return;

        // Compute RMS audio level on raw input for the UI volume meter (0 - 100)
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        const level = Math.min(100, Math.round(rms * 450));
        if (isMountedRef.current) {
          setAudioLevel(level);
        }

        // Downsample input buffer from native hardware rate (e.g. 48kHz / 44.1kHz) to exact 16,000Hz
        const downsampled = downsampleTo16k(input, nativeRate, 16000);

        // Convert calibrated 16kHz Float32 to 16-bit signed Linear PCM
        const pcm = new Int16Array(downsampled.length);
        for (let i = 0; i < downsampled.length; i++) {
          const s = Math.max(-1, Math.min(1, downsampled[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Transmit calibrated linear16 PCM binary chunk to backend
        if (ws.readyState === WebSocket.OPEN && pcm.length > 0) {
          ws.send(pcm.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      if (isMountedRef.current) {
        setIsCapturing(true);
      }

    } catch (err) {
      console.error("[Audio] Setup error:", err);
      if (isMountedRef.current) {
        setAudioStatus(`Failed: ${err.message}`);
      }
    }
  }, [stopAudio]);

  useEffect(() => {
    isMountedRef.current = true;
    startAudio();
    return () => {
      isMountedRef.current = false;
      stopAudio();
    };
  }, [startAudio, stopAudio]);

  return {
    isCapturing,
    audioLevel,
    audioStatus,
    startAudio,
    stopAudio,
    startCapture: startAudio,
    stopCapture: stopAudio,
    switchAudioSource: startAudio,
    isMicActive: isCapturing,
    isSystemActive: false,
    error: null,
  };
};

export default useAudioCapture;
