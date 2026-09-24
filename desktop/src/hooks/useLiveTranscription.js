import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const WS_URL = 'ws://127.0.0.1:8000/ws/transcription';

export function useLiveTranscription() {
  const [transcripts, setTranscripts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioCapturing, setIsAudioCapturing] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false);
  const [activeProvider, setActiveProviderState] = useState('groq');
  const [contextStatus, setContextStatus] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [isAudioSilent, setIsAudioSilent] = useState(false);
  const [activeCodeContext, setActiveCodeContext] = useState({
    hasActiveCode: false,
    problemTitle: '',
    language: '',
    preview: '',
  });

  // Dual-buffer transcript state: confirmed finalized turns + transient live interim hypothesis
  const [confirmedHistory, setConfirmedHistory] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  // System Loopback Audio Status from backend
  const [systemAudioStatus, setSystemAudioStatus] = useState({
    loopbackActive: false,
    isActive: false,
    deviceName: '',
    sampleRate: 48000,
    rms: 0,
  });

  const MAX_WORDS = 30;

  const handleIncomingTranscript = useCallback((newText, isFinal = false) => {
    if (!newText || !newText.trim()) return;
    const cleanText = newText.trim();
    if (isFinal) {
      setConfirmedHistory((prev) => {
        // Deduplicate if identical finalized sentence was already appended
        if (prev && (prev === cleanText || prev.endsWith(` ${cleanText}`) || prev.endsWith(cleanText))) {
          return prev;
        }
        const updated = prev ? `${prev} ${cleanText}` : cleanText;
        const words = updated.split(/\s+/).filter(Boolean);
        if (words.length > MAX_WORDS) {
          return words.slice(words.length - MAX_WORDS).join(" ");
        }
        return updated;
      });
      setInterimTranscript(''); // Clear active interim hypothesis
    } else {
      setInterimTranscript(cleanText); // REPLACE, do NOT do prev + text
    }
  }, []);

  const resetRollingTranscript = useCallback((newText = '') => {
    setConfirmedHistory(newText.trim());
    setInterimTranscript('');
  }, []);

  // Rolling 30-word window: confirmed history + transient interim hypothesis
  const rollingTranscript = useMemo(() => {
    const combined = confirmedHistory && interimTranscript
      ? `${confirmedHistory} ${interimTranscript}`
      : (confirmedHistory || interimTranscript || '');
    if (!combined) return '';
    const words = combined.split(/\s+/).filter(Boolean);
    if (words.length > MAX_WORDS) {
      return words.slice(words.length - MAX_WORDS).join(' ');
    }
    return combined;
  }, [confirmedHistory, interimTranscript]);

  // Audio Routing State
  const [audioSource, setAudioSourceState] = useState('both'); // 'both' | 'system' | 'mic'
  const [micId, setMicIdState] = useState(null);
  const [systemId, setSystemIdState] = useState(null);
  const [audioDevices, setAudioDevices] = useState({ inputs: [], outputs: [] });

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const lastAudioActivityRef = useRef(Date.now());

  // Fetch detected audio hardware devices
  const fetchAudioDevices = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/audio/devices');
      if (res.ok) {
        const data = await res.json();
        setAudioDevices({
          inputs: data.inputs || [],
          outputs: data.outputs || [],
        });
        if (data.active_mode) setAudioSourceState(data.active_mode);
        if (data.active_mic_id !== undefined) setMicIdState(data.active_mic_id);
        if (data.active_system_id !== undefined) setSystemIdState(data.active_system_id);
      }
    } catch (err) {
      console.warn('Could not query audio devices from backend:', err);
    }
  }, []);

  // Fetch devices on mount
  useEffect(() => {
    fetchAudioDevices();
  }, [fetchAudioDevices]);

  // Silent audio watchdog (30 seconds threshold)
  useEffect(() => {
    const watchdogInterval = setInterval(() => {
      if (isAudioCapturing && isConnected) {
        const silentDuration = Date.now() - lastAudioActivityRef.current;
        if (silentDuration > 30000) {
          setIsAudioSilent(true);
        }
      } else {
        setIsAudioSilent(false);
      }
    }, 5000);

    return () => clearInterval(watchdogInterval);
  }, [isAudioCapturing, isConnected]);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const socket = new WebSocket(WS_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        lastAudioActivityRef.current = Date.now();
        setIsAudioSilent(false);
        socket.pingInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: 'ping' }));
          }
        }, 10000);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Reset audio watchdog activity timer
          if (data.type === 'transcript' || data.type === 'audio_frame' || data.type === 'answer_chunk') {
            lastAudioActivityRef.current = Date.now();
            setIsAudioSilent(false);
          }

          // 1. Transcription Events (Overwrite semantics for interim, append for final)
          if (data.type === 'transcript') {
            const cleanText = (data.text || '').trim();
            if (!cleanText) return;

            if (data.is_final) {
              setTranscripts((prev) => [
                ...prev,
                {
                  speaker: data.speaker || 'interviewer',
                  text: cleanText,
                  timestamp: data.timestamp || new Date().toLocaleTimeString(),
                  confidence: data.confidence || 0.95,
                },
              ]);
              handleIncomingTranscript(cleanText, true);
              if (data.speaker === 'interviewer' || !data.speaker) {
                setCurrentQuestion(cleanText);
              }
            } else {
              handleIncomingTranscript(cleanText, false);
            }
          }
          // 1b. Intent Confirmed Question Trigger
          else if (data.type === 'question_detected') {
            if (data.question) {
              const cleanQ = (data.question || '').trim();
              setCurrentQuestion(cleanQ);
              setConfirmedHistory(cleanQ);
              setInterimTranscript('');
            }
          }
          // 2. Answer Generation Token Streaming
          else if (data.type === 'answer_chunk') {
            if (data.is_first) {
              setStreamingAnswer(data.token || '');
              setIsGeneratingAnswer(true);
              if (data.question) setCurrentQuestion(data.question);
            } else if (data.is_done) {
              setIsGeneratingAnswer(false);
            } else {
              setStreamingAnswer((prev) => prev + (data.token || ''));
            }
          }
          // 3. Telemetry Diagnostic Metrics
          else if (data.type === 'telemetry') {
            setTelemetry(data.metrics);
          }
          // 4. Code Context Synchronization
          else if (data.type === 'code_context_updated') {
            setActiveCodeContext({
              hasActiveCode: true,
              problemTitle: data.problem_title || 'On-Screen Coding Problem',
              language: data.language || 'python',
              preview: data.solution_preview || data.code_preview || '',
            });
          }
          else if (data.type === 'code_context_cleared') {
            setActiveCodeContext({
              hasActiveCode: false,
              problemTitle: '',
              language: '',
              preview: '',
            });
          }
          // 5. System Audio Loopback Status
          else if (data.type === 'system_audio_status') {
            const hasAudio = Boolean(data.is_active || (data.rms && data.rms > 0.002));
            setSystemAudioStatus({
              loopbackActive: Boolean(data.loopback_active),
              isActive: hasAudio,
              deviceName: data.device_name || '',
              sampleRate: data.sample_rate || 48000,
              rms: data.rms || 0,
            });
            if (hasAudio) {
              lastAudioActivityRef.current = Date.now();
              setIsAudioSilent(false);
            }
          }
          // 5. System Events
          else if (data.type === 'system') {
            if (data.event === 'connected') {
              if (data.active_provider) setActiveProviderState(data.active_provider);
              if (data.context_status) setContextStatus(data.context_status);
              if (data.audio_source) setAudioSourceState(data.audio_source);
              if (data.system_audio_status) {
                setSystemAudioStatus({
                  loopbackActive: Boolean(data.system_audio_status.loopback_active),
                  isActive: Boolean(data.system_audio_status.is_active || (data.system_audio_status.rms && data.system_audio_status.rms > 0.002)),
                  deviceName: data.system_audio_status.device_name || '',
                  sampleRate: data.system_audio_status.sample_rate || 48000,
                  rms: data.system_audio_status.rms || 0,
                });
              }
              if (data.active_code_summary) {
                setActiveCodeContext({
                  hasActiveCode: Boolean(data.active_code_summary.has_active_code),
                  problemTitle: data.active_code_summary.problem_title || '',
                  language: data.active_code_summary.language || '',
                  preview: data.active_code_summary.code_preview || '',
                });
              }
            } else if (data.event === 'pipeline_started') {
              setIsAudioCapturing(true);
              if (data.audio_source) setAudioSourceState(data.audio_source);
              lastAudioActivityRef.current = Date.now();
              setIsAudioSilent(false);
            } else if (data.event === 'audio_source_changed') {
              if (data.audio_source) setAudioSourceState(data.audio_source);
              if (data.mic_id !== undefined) setMicIdState(data.mic_id);
              if (data.system_id !== undefined) setSystemIdState(data.system_id);
            } else if (data.event === 'pipeline_stopped') {
              setIsAudioCapturing(false);
              setIsAudioSilent(false);
            } else if (data.event === 'context_updated') {
              if (data.context_status) setContextStatus(data.context_status);
            } else if (data.event === 'session_cleared' || data.event === 'data_reset') {
              setActiveCodeContext({
                hasActiveCode: false,
                problemTitle: '',
                language: '',
                preview: '',
              });
            }
          }

        } catch (err) {
          console.error('Error parsing transcript WebSocket message:', err);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        if (socket.pingInterval) clearInterval(socket.pingInterval);
        
        const timeout = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, timeout);
      };

      socket.onerror = (err) => {
        console.warn('Transcript WebSocket error:', err);
        socket.close();
      };
    } catch (e) {
      console.warn('Could not establish WebSocket connection:', e);
      const timeout = 3000;
      reconnectTimeoutRef.current = setTimeout(connect, timeout);
    }
  }, [isAudioCapturing]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        if (wsRef.current.pingInterval) clearInterval(wsRef.current.pingInterval);
        wsRef.current.close();
      }
    };
  }, [connect]);

  const setProvider = (providerName) => {
    setActiveProviderState(providerName);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'set_provider', provider: providerName }));
    }
  };

  // Switch audio source live
  const setAudioSource = async (source, newMicId = null, newSystemId = null) => {
    setAudioSourceState(source);
    if (newMicId !== null) setMicIdState(newMicId);
    if (newSystemId !== null) setSystemIdState(newSystemId);

    // 1. Notify over REST
    try {
      await fetch('http://127.0.0.1:8000/api/audio/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_source: source,
          mic_id: newMicId ?? micId,
          system_id: newSystemId ?? systemId,
        }),
      });
    } catch (err) {
      console.warn('REST audio routing notice:', err);
    }

    // 2. Notify over WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'set_audio_source',
        audio_source: source,
        mic_id: newMicId ?? micId,
        system_id: newSystemId ?? systemId,
      }));
    }
  };

  const setActiveResume = async (resumeId) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/context/activate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: resumeId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.context) setContextStatus(data.context);
      }
    } catch (err) {
      console.warn('Error activating resume on backend:', err);
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'activate_resume',
        resume_id: resumeId,
      }));
    }
  };

  const forceGenerate = (questionText, resumeIdOverride = null) => {
    const q = questionText || currentQuestion || (transcripts.length > 0 ? transcripts[transcripts.length - 1].text : '');
    if (!q) return;

    const targetResumeId = resumeIdOverride || contextStatus?.active_resume_id;

    setIsGeneratingAnswer(true);
    setStreamingAnswer('');
    setCurrentQuestion(q);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        action: 'generate', 
        question: q,
        provider: activeProvider,
        resume_id: targetResumeId,
      }));
    }
  };

  const startStreaming = async () => {
    try {
      await fetch('http://127.0.0.1:8000/api/audio/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_source: audioSource,
          mic_id: micId,
          system_id: systemId,
        }),
      });
      setIsAudioCapturing(true);
      lastAudioActivityRef.current = Date.now();
      setIsAudioSilent(false);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          action: 'start',
          audio_source: audioSource,
          mic_id: micId,
          system_id: systemId,
        }));
      }
    } catch (e) {
      console.error('Error starting audio pipeline:', e);
    }
  };

  const stopStreaming = async () => {
    try {
      await fetch('http://127.0.0.1:8000/api/audio/stop', { method: 'POST' });
      setIsAudioCapturing(false);
      setIsAudioSilent(false);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'stop' }));
      }
    } catch (e) {
      console.error('Error stopping audio pipeline:', e);
    }
  };

  const clearTranscripts = () => {
    setTranscripts([]);
    setConfirmedHistory('');
    setInterimTranscript('');
    setCurrentQuestion('');
    setStreamingAnswer('');
    setIsGeneratingAnswer(false);
    setTelemetry(null);
  };

  const clearActiveCodeContext = async () => {
    setActiveCodeContext({
      hasActiveCode: false,
      problemTitle: '',
      language: '',
      preview: '',
    });
    try {
      await fetch('http://127.0.0.1:8000/api/session/active-code', { method: 'DELETE' });
    } catch (e) {
      console.warn('Error clearing active code context via REST:', e);
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'clear_code_context' }));
    }
  };

  return {
    transcripts,
    confirmedHistory,
    finalizedTranscript: confirmedHistory,
    interimTranscript,
    rollingTranscript,
    resetRollingTranscript,
    handleIncomingTranscript,
    isConnected,
    isAudioCapturing,
    currentQuestion,
    streamingAnswer,
    isGeneratingAnswer,
    activeProvider,
    contextStatus,
    activeCodeContext,
    setActiveCodeContext,
    clearActiveCodeContext,
    telemetry,
    isAudioSilent,
    audioSource,
    systemAudioStatus,
    micId,
    systemId,
    audioDevices,
    setAudioSource,
    fetchAudioDevices,
    setProvider,
    setActiveResume,
    forceGenerate,
    startStreaming,
    stopStreaming,
    clearTranscripts,
    setContextStatus,
  };
}

