import React, { useState, useEffect, useCallback, useRef } from 'react';
import { VolumeX, Code, X, Sparkles, Maximize2 } from 'lucide-react';
import HudTopBar from './HudTopBar';
import ActiveQuestionBar from './ActiveQuestionBar';
import AnswerPanel from './AnswerPanel';
import ContextModal from './ContextModal';
import { useLiveTranscription } from '../hooks/useLiveTranscription';
import { useSessionHistory } from '../hooks/useSessionHistory';
import { useAudioCapture } from '../hooks/useAudioCapture';

export default function OverlayHUD({ sessionConfig = null, onEndSessionProp = null }) {
  const [hudMode, setHudMode] = useState('expanded'); // 'expanded' | 'widget'
  const {
    transcripts,
    confirmedHistory,
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
    setAudioSource,
    setProvider,
    forceGenerate,
    startStreaming,
    stopStreaming,
    clearTranscripts,
    setContextStatus,
  } = useLiveTranscription();

  const {
    isCapturing: isPcmCapturing,
    audioStatus,
    isMicActive,
    isSystemActive,
    audioLevel,
    startAudio,
    stopAudio,
    switchAudioSource,
  } = useAudioCapture(handleIncomingTranscript);

  const {
    history,
    currentIndex,
    totalQuestions,
    currentItem,
    addQuestionItem,
    updateCurrentItem,
    updateCurrentAnswer,
    goToPrev,
    goToNext,
    clearCurrent,
    clearAll,
    hasPrev,
    hasNext,
  } = useSessionHistory();

  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [opacity, setOpacityState] = useState(0.95);
  const [clickThrough, setClickThroughState] = useState(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  
  // 3-Tier Layout Visibility & Sizing State
  const [isCardCollapsed, setIsCardCollapsed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAnalyzingScreen, setIsAnalyzingScreen] = useState(false);
  const isAnalyzingRef = useRef(false);
  const [screenAnalysisStatus, setScreenAnalysisStatus] = useState('⚡ Reading screen...');
  const [activeQuestionBuffer, setActiveQuestionBuffer] = useState('');
  const [hudWidth, setHudWidth] = useState(650);
  const [panelHeight, setPanelHeight] = useState(null);
  const containerRef = useRef(null);

  // Listen for hud-mode-change from Electron (widget <-> expanded)
  useEffect(() => {
    if (window.electronAPI?.onHudModeChange) {
      const unsub = window.electronAPI.onHudModeChange((data) => {
        if (data?.mode) {
          setHudMode(data.mode);
        }
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, []);

  // Auto-sync native Electron window dimensions to exact DOM content size
  useEffect(() => {
    if (hudMode === 'widget') return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (window.electronAPI?.resizeOverlay) {
          window.electronAPI.resizeOverlay({
            width: Math.ceil(width) + 24,
            height: Math.ceil(height) + 24,
          });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [hudMode]);

  // Click-through forwarding: Ignore mouse events on empty transparent background
  useEffect(() => {
    let lastIgnored = null;
    const handleMouseMove = (e) => {
      const isOverInteractive = Boolean(e.target.closest('.interactive-hud-element'));
      const shouldIgnore = !isOverInteractive;

      if (lastIgnored !== shouldIgnore) {
        lastIgnored = shouldIgnore;
        if (isOverInteractive) {
          window.electronAPI?.setIgnoreMouse(false);
        } else {
          window.electronAPI?.setIgnoreMouse(true, { forward: true });
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Interactive Bottom-Right Corner Resize Handler
  const handleStartResize = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = hudWidth;
    const cardElement = containerRef.current?.querySelector('.answer-panel-card');
    const startH = cardElement ? cardElement.offsetHeight : 450;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const newWidth = Math.max(420, Math.min(1050, startW + deltaX));
      setHudWidth(newWidth);

      if (cardElement) {
        const newHeight = Math.max(220, Math.min(850, startH + deltaY));
        setPanelHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [hudWidth]);

  // Active session parameters
  const [activeSession, setActiveSession] = useState(sessionConfig || null);

  // Ensure clean slate on component mount
  useEffect(() => {
    clearTranscripts();
    clearAll();
    setActiveQuestionBuffer('');
  }, []);

  // Track active question buffer from live transcription
  useEffect(() => {
    if (currentQuestion) {
      setActiveQuestionBuffer(currentQuestion);
    }
  }, [currentQuestion]);

  // Synchronize incoming live audio stream into session history
  const activeStreamQuestionRef = useRef('');

  useEffect(() => {
    if (streamingAnswer) {
      if (!activeStreamQuestionRef.current) {
        activeStreamQuestionRef.current = currentQuestion || activeQuestionBuffer || rollingTranscript || 'Spoken Question';
        addQuestionItem(activeStreamQuestionRef.current, streamingAnswer);
      } else {
        updateCurrentAnswer(streamingAnswer);
      }
    } else {
      activeStreamQuestionRef.current = '';
    }
  }, [streamingAnswer, currentQuestion, activeQuestionBuffer, rollingTranscript, addQuestionItem, updateCurrentAnswer]);

  // Listen for Electron session:started events
  useEffect(() => {
    if (window.electronAPI?.onSessionStarted) {
      const unsub = window.electronAPI.onSessionStarted((data) => {
        if (data) {
          setActiveSession(data);
          if (data.selectedModel) setProvider(data.selectedModel);
          // Clean slate reset on session start
          clearTranscripts();
          clearAll();
          setActiveQuestionBuffer('');
          setSessionSeconds(0);
          // Ensure audio pipeline and microphone capture are activated
          startStreaming();
          startAudio(data.audio_source || 'both');
        }
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, [setProvider, clearTranscripts, clearAll, startStreaming, startAudio]);

  // Session timer increment
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (totalSeconds) => {
    const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  // Electron IPC Handlers
  const handleOpacityChange = (val) => {
    setOpacityState(val);
    if (window.electronAPI?.setOpacity) {
      window.electronAPI.setOpacity(val);
    }
  };

  const handleClickThroughToggle = (val) => {
    setClickThroughState(val);
    if (window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(val, { forward: true });
    }
  };

  const handleMinimize = () => {
    if (window.electronAPI?.toggleWidgetMode) {
      window.electronAPI.toggleWidgetMode(true);
    } else if (window.electronAPI?.minimize) {
      window.electronAPI.minimize();
    }
  };

  // Clear handlers
  const handleClearQuestionBuffer = () => {
    setActiveQuestionBuffer('');
    clearTranscripts();
    resetRollingTranscript('');
  };

  const handleClearCard = () => {
    clearCurrent();
    if (history.length <= 1) {
      handleClearQuestionBuffer();
    }
  };

  // Manual Question & Typed Chat SSE Generator
  const [isManualGenerating, setIsManualGenerating] = useState(false);

  const handleManualQuestion = useCallback(async (customQ = null) => {
    const targetQ = (typeof customQ === 'string' ? customQ : '') || activeQuestionBuffer || rollingTranscript || currentQuestion;
    if (!targetQ || !targetQ.trim()) return;
    const cleanQ = targetQ.trim();

    if (autoTriggerTimerRef.current) {
      clearTimeout(autoTriggerTimerRef.current);
    }
    lastAutoTriggeredTextRef.current = cleanQ;

    setIsCardCollapsed(false);
    setActiveQuestionBuffer(cleanQ);
    resetRollingTranscript(cleanQ);
    setIsManualGenerating(true);

    // Immediately update or add question and show loading state in AnswerPanel
    addQuestionItem(cleanQ, '');

    try {
      const res = await fetch('http://127.0.0.1:8000/api/generate/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: cleanQ,
          provider: activeProvider,
          has_code_context: Boolean(activeCodeContext?.hasActiveCode),
        }),
      });

      if (!res.body) {
        setIsManualGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) {
                accumulated += data.token;
                updateCurrentItem(cleanQ, accumulated);
              } else if (data.done && data.full_text) {
                updateCurrentItem(cleanQ, data.full_text);
              }
            } catch {
              // Ignore SSE framing artifacts
            }
          }
        }
      }
    } catch (err) {
      console.error('Error generating manual question answer:', err);
      // Fallback to WebSocket generator if SSE fails
      forceGenerate(cleanQ);
    } finally {
      setIsManualGenerating(false);
    }
  }, [activeQuestionBuffer, rollingTranscript, currentQuestion, activeProvider, activeCodeContext, addQuestionItem, updateCurrentItem, resetRollingTranscript, forceGenerate]);


  // ── Auto-Trigger Heuristic with 1.2s Debounce ──
  const autoTriggerTimerRef = useRef(null);
  const lastAutoTriggeredTextRef = useRef('');

  const QUESTION_CUES = [
    'how', 'what', 'why', 'write', 'create', 'explain', 'implement',
    'can you', 'could you', 'tell me', 'describe', 'difference', 'code', 'solve'
  ];

  const isQuestionOrCommand = (text) => {
    if (!text) return false;
    const clean = text.trim().toLowerCase();
    if (clean.length < 8) return false;
    if (clean.includes('?')) return true;
    return QUESTION_CUES.some((cue) => clean.startsWith(cue) || clean.includes(` ${cue} `));
  };

  useEffect(() => {
    const currentText = (rollingTranscript || currentQuestion || '').trim();
    if (!currentText || isGeneratingAnswer || isManualGenerating || isAnalyzingScreen) {
      return;
    }

    if (autoTriggerTimerRef.current) {
      clearTimeout(autoTriggerTimerRef.current);
    }

    if (isQuestionOrCommand(currentText)) {
      if (lastAutoTriggeredTextRef.current === currentText) {
        return;
      }

      autoTriggerTimerRef.current = setTimeout(() => {
        lastAutoTriggeredTextRef.current = currentText;
        console.log('[Auto-Trigger] Triggering answer for detected question:', currentText);
        handleManualQuestion(currentText);
      }, 1200);
    }

    return () => {
      if (autoTriggerTimerRef.current) {
        clearTimeout(autoTriggerTimerRef.current);
      }
    };
  }, [rollingTranscript, currentQuestion, isGeneratingAnswer, isManualGenerating, isAnalyzingScreen, handleManualQuestion]);

  const toggleAudioCapture = () => {
    if (isAudioCapturing || isPcmCapturing) {
      stopStreaming();
      stopAudio();
    } else {
      startStreaming();
      startAudio(audioSource);
    }
  };

  const handleAudioSourceChange = (newSource) => {
    setAudioSource(newSource);
    switchAudioSource(newSource);
  };

  // End session handler
  const handleEndSession = async () => {
    stopStreaming();
    stopAudio();
    try {
      await fetch('http://127.0.0.1:8000/api/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession?.id,
          duration: formatTime(sessionSeconds),
        }),
      });
    } catch (e) {
      console.warn('Backend session end notification note:', e);
    }

    const summaryData = {
      id: activeSession?.id || `ses-${Date.now()}`,
      company: activeSession?.company || activeSession?.companyName || 'Google',
      role: activeSession?.role || activeSession?.jobTitle || 'Senior Staff Software Engineer',
      sessionType: activeSession?.sessionType || 'interview',
      startTime: activeSession?.startTime || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric' }),
      duration: formatTime(sessionSeconds),
      provider: activeProvider === 'groq' ? '⚡ Groq (Llama 3.3 70B)' : activeProvider === 'gemini' ? '✨ Gemini 2.5 Flash' : 'OpenAI GPT-4o Mini',
      audioSource: audioSource === 'both' ? '🔄 Both (System + Mic)' : audioSource === 'system' ? '🔊 System Audio' : '🎙️ Microphone',
      transcripts: transcripts.length > 0 ? transcripts : undefined,
      questions: history.length > 0 ? history : undefined,
    };

    if (window.electronAPI?.endSession) {
      window.electronAPI.endSession(summaryData);
    }
    if (onEndSessionProp) {
      onEndSessionProp(summaryData);
    }
  };

  // Ultra-Fast Local OCR + Groq Streaming Problem Solver (< 1s Latency)
  const handleCaptureAndSolve = useCallback(async (existingPayload = null) => {
    if (isAnalyzingRef.current) {
      console.log('[OverlayHUD] Screen analysis already running, skipping duplicate call.');
      return;
    }
    isAnalyzingRef.current = true;
    setIsAnalyzingScreen(true);
    setScreenAnalysisStatus('⚡ Reading screen...');
    setIsCardCollapsed(false);
    setActiveQuestionBuffer('Reading on-screen coding challenge / problem...');

    // Single card entry in history
    addQuestionItem('Reading On-Screen Problem...', '');

    try {
      let extractedText = '';

      if (existingPayload) {
        if (typeof existingPayload === 'string') {
          extractedText = existingPayload;
        } else if (typeof existingPayload === 'object') {
          extractedText = existingPayload.extracted_text || existingPayload.text || '';
        }
      }

      // Step 1: Rapid Local OCR (~100-150ms in Electron)
      if (!extractedText) {
        if (window.electronAPI?.fastScreenExtract) {
          const ocrRes = await window.electronAPI.fastScreenExtract();
          if (ocrRes && ocrRes.success) {
            extractedText = ocrRes.extracted_text || '';
          } else if (ocrRes && ocrRes.error) {
            throw new Error(ocrRes.error);
          }
        } else if (window.electronAPI?.extractScreenText) {
          const ocrRes = await window.electronAPI.extractScreenText();
          if (ocrRes && ocrRes.success) {
            extractedText = ocrRes.extracted_text || '';
          }
        }
      }

      const cleanText = (extractedText || '').trim();
      if (!cleanText || cleanText.length < 5) {
        setActiveQuestionBuffer('No Problem Text Detected');
        updateCurrentItem(
          'No Readable Code Detected',
          '⚠️ **No readable coding problem detected on screen.**\n\n• Ensure the IDE, browser, or LeetCode question is visible and not minimized.\n• Press `⇧⌘↵` or click **Screenshot** again.'
        );
        return;
      }

      // Step 2: Stream Groq LLaMA 3.3 tokens in under 300ms
      setScreenAnalysisStatus('⚡ Solving problem...');
      const targetLang = activeSession?.role || activeSession?.jobTitle || 'Python';

      const res = await fetch('http://127.0.0.1:8000/api/vision/solve-fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extracted_text: cleanText,
          language_hint: targetLang,
          provider: activeProvider,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned ${res.status}`);
      }

      if (!res.body) {
        throw new Error('No streaming response body received from solver');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let problemTitle = 'On-Screen Coding Problem';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) {
                accumulated += data.token;
                const titleMatch = accumulated.match(/💬\s*(?:Problem|Question):\s*([^\n]+)/i);
                if (titleMatch) {
                  problemTitle = titleMatch[1].trim();
                  setActiveQuestionBuffer(problemTitle);
                }
                updateCurrentItem(problemTitle, accumulated);
              } else if (data.done && data.full_text) {
                const finalMatch = data.full_text.match(/💬\s*(?:Problem|Question):\s*([^\n]+)/i);
                if (finalMatch) {
                  problemTitle = finalMatch[1].trim();
                  setActiveQuestionBuffer(problemTitle);
                }
                updateCurrentItem(problemTitle, data.full_text);
                setActiveCodeContext({
                  hasActiveCode: true,
                  problemTitle: problemTitle,
                  language: targetLang,
                  preview: data.full_text.slice(0, 150),
                });
              }
            } catch {
              // Ignore SSE framing parsing quirks
            }
          }
        }
      }

      if (accumulated) {
        setActiveCodeContext({
          hasActiveCode: true,
          problemTitle: problemTitle,
          language: targetLang,
          preview: accumulated.slice(0, 150),
        });
      }
    } catch (err) {
      console.error('[OverlayHUD] Screen capture and fast solve error:', err);
      updateCurrentItem(
        'Screen Analysis Error',
        `❌ **Screen Analysis Failed**: ${err.message || 'Unknown network error'}\n\n• Please verify your backend server status at \`http://127.0.0.1:8000\`.\n• Verify \`GROQ_API_KEY\` in \`.env\`.`
      );
    } finally {
      isAnalyzingRef.current = false;
      setIsAnalyzingScreen(false);
      setScreenAnalysisStatus('⚡ Reading screen...');
    }
  }, [addQuestionItem, updateCurrentItem, activeSession, activeProvider, setActiveCodeContext]);

  // Register global shortcut listener for screen capture (Cmd/Ctrl + Shift + S)
  useEffect(() => {
    if (window.electronAPI?.onGlobalShortcutCapture) {
      const unsub = window.electronAPI.onGlobalShortcutCapture((payload) => {
        handleCaptureAndSolve(payload);
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, [handleCaptureAndSolve]);

  // Context-Locked Multi-Turn Follow-Up (Pseudocode, Explanation, Dry Run, Custom)
  const handleFollowup = useCallback(async (queryText) => {
    if (!queryText || !queryText.trim()) return;
    const cleanQuery = queryText.trim();

    if (autoTriggerTimerRef.current) {
      clearTimeout(autoTriggerTimerRef.current);
    }
    lastAutoTriggeredTextRef.current = cleanQuery;

    setIsCardCollapsed(false);
    setActiveQuestionBuffer(cleanQuery);
    setIsManualGenerating(true);

    // Update or add question card and show thinking state
    addQuestionItem(cleanQuery, '');

    try {
      const res = await fetch('http://127.0.0.1:8000/api/generate/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: cleanQuery,
          provider: activeProvider,
        }),
      });

      if (!res.body) {
        setIsManualGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) {
                accumulated += data.token;
                updateCurrentItem(cleanQuery, accumulated);
              } else if (data.done && data.full_text) {
                updateCurrentItem(cleanQuery, data.full_text);
              }
            } catch {
              // Ignore SSE control parse
            }
          }
        }
      }
    } catch (err) {
      console.error('Error streaming follow-up answer:', err);
      // Fallback to manual question
      handleManualQuestion(cleanQuery);
    } finally {
      setIsManualGenerating(false);
    }
  }, [activeProvider, addQuestionItem, updateCurrentItem, handleManualQuestion]);

  // Global Keyboard Shortcuts (⌘↵ / Ctrl+Enter, ⇧⌘↵ / Screenshot, ⇧⌘D, ⇧⌘⌫)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // ⌘↵ / Ctrl+Enter -> Force answer/code generation for whatever is currently in the active question bar
      if (isCmdOrCtrl && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const targetQ = activeQuestionBuffer || rollingTranscript || currentQuestion;
        if (targetQ && targetQ.trim()) {
          handleManualQuestion(targetQ);
        }
      }
      // ⇧⌘↵ or ⇧⌘S -> Screenshot
      if (isCmdOrCtrl && e.shiftKey && (e.key === 'Enter' || e.key.toLowerCase() === 's')) {
        e.preventDefault();
        handleCaptureAndSolve();
      }
      // ⇧⌘D -> Toggle Chat / Follow-up input
      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsChatOpen((prev) => !prev);
      }
      // ⇧⌘⌫ -> Clear Question Buffer
      if (isCmdOrCtrl && e.shiftKey && e.key === 'Backspace') {
        e.preventDefault();
        handleClearQuestionBuffer();
      }
      // Alt+X -> Click-through toggle
      if (e.altKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleClickThroughToggle(!clickThrough);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clickThrough, activeQuestionBuffer, rollingTranscript, currentQuestion, handleManualQuestion, handleClearQuestionBuffer, handleCaptureAndSolve]);

  // Displayed Question & Answer (from current paginated history item or active stream)
  const displayQuestion = currentItem?.question || activeQuestionBuffer || rollingTranscript || currentQuestion;
  const displayAnswer = currentItem?.answer || streamingAnswer;

  // ── Parakeet Floating Widget Mode ──
  if (hudMode === 'widget') {
    return (
      <div
        className="interactive-hud-element w-full h-full flex items-center justify-center select-none app-drag"
        style={{ WebkitAppRegion: 'drag', opacity }}
        title="Parakeet AI Copilot (Click to restore, Drag to reposition)"
      >
        <button
          type="button"
          onClick={() => {
            if (window.electronAPI?.toggleWidgetMode) {
              window.electronAPI.toggleWidgetMode(false);
            }
          }}
          className="group w-[56px] h-[56px] rounded-2xl bg-[#1c1c20]/95 hover:bg-[#25252b] border border-emerald-500/40 hover:border-emerald-400 shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 relative overflow-hidden"
          style={{ WebkitAppRegion: 'no-drag' }}
          title="Click to restore full HUD (Drag outer edges to move)"
        >
          {/* Subtle animated gradient glow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/15 via-indigo-500/10 to-teal-500/15 opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none" />

          {/* Active listening green dot indicator */}
          <div className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </div>

          {/* Center Icon: Sparkles with hover Maximize2 */}
          <div className="relative z-10 flex items-center justify-center text-emerald-400 group-hover:text-white transition-colors">
            <Sparkles className="w-5 h-5 group-hover:hidden transition-all duration-200 drop-shadow-md" />
            <Maximize2 className="w-5 h-5 hidden group-hover:block text-white transition-all duration-200" />
          </div>

          {/* Mini status indicator */}
          <span className="relative z-10 text-[9px] font-bold text-neutral-300 group-hover:text-emerald-300 transition-colors mt-0.5 tracking-tight font-mono">
            {isAudioCapturing ? (audioLevel > 5 ? '🎙️ Live' : 'AI') : 'Muted'}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full p-2 flex flex-col box-border select-none items-center justify-start transition-all bg-transparent"
      style={{ opacity }}
    >
      <div
        ref={containerRef}
        className="w-full flex flex-col items-center justify-start transition-[max-width] duration-150 relative"
        style={{ maxWidth: `${hudWidth}px`, width: '100%' }}
      >
        {/* ── Tier 1: Top Floating Control Bar ── */}
        <HudTopBar
          isBackendConnected={isConnected}
          isAudioCapturing={isAudioCapturing || isPcmCapturing}
          audioStatus={audioStatus}
          audioLevel={audioLevel}
          systemAudioStatus={systemAudioStatus}
          sessionTime={formatTime(sessionSeconds)}
          sessionSeconds={sessionSeconds}
          selectedModel={activeProvider}
          setSelectedModel={setProvider}
          audioSource={audioSource}
          setAudioSource={handleAudioSourceChange}
          onScreenshot={() => handleCaptureAndSolve()}
          onForceGenerate={() => handleManualQuestion()}
          onToggleChat={() => setIsChatOpen((prev) => !prev)}
          isChatOpen={isChatOpen}
          isAnalyzingScreen={isAnalyzingScreen}
          screenAnalysisStatus={screenAnalysisStatus}
          opacity={opacity}
          setOpacity={handleOpacityChange}
          clickThrough={clickThrough}
          setClickThrough={handleClickThroughToggle}
          onMinimize={handleMinimize}
          onEndSession={handleEndSession}
          onToggleAudio={toggleAudioCapture}
          onOpenContextModal={() => setIsContextModalOpen(true)}
          contextStatus={contextStatus}
          hudWidth={hudWidth}
          onSetHudWidth={setHudWidth}
        />

        {/* ── Active Code in Context Badge ── */}
        {activeCodeContext?.hasActiveCode && (
          <div className="interactive-hud-element w-full mx-auto my-1.5 px-3 py-1 bg-emerald-950/70 border border-emerald-500/40 rounded-xl flex items-center justify-between text-[11px] text-emerald-300 font-mono shadow-md backdrop-blur-md pointer-events-auto animate-in fade-in duration-200">
            <div className="flex items-center space-x-2 truncate">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-emerald-200 shrink-0">💻 Active Code in Context:</span>
              <span className="text-emerald-300/90 truncate max-w-[280px]">
                {activeCodeContext.problemTitle || 'On-Screen Coding Problem'}
              </span>
              {activeCodeContext.language && (
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  {activeCodeContext.language}
                </span>
              )}
            </div>
            <button
              onClick={clearActiveCodeContext}
              title="Clear Active Code Context"
              className="ml-2 px-1.5 py-0.5 rounded hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-200 transition-colors text-xs flex items-center gap-1 cursor-pointer"
            >
              <span>✕</span>
            </button>
          </div>
        )}

        {/* ── Tier 2: Active Single-Question Bar ── */}
        <ActiveQuestionBar
          finalizedText={activeQuestionBuffer || confirmedHistory}
          questionText={activeQuestionBuffer || confirmedHistory}
          interimText={interimTranscript}
          isAudioCapturing={isAudioCapturing || isPcmCapturing}
          isGenerating={isGeneratingAnswer}
          lockedQuestion={currentQuestion}
          isCollapsed={isCardCollapsed}
          onToggleCollapse={() => setIsCardCollapsed((prev) => !prev)}
          onClearQuestion={handleClearQuestionBuffer}
          onAnswerQuestion={(text) => handleManualQuestion(text)}
        />

        {/* Silent Audio Inactivity Alert */}
        {isAudioSilent && isAudioCapturing && (
          <div className="interactive-hud-element w-full mx-auto mt-1.5 px-3 py-1 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center justify-between text-[11px] text-amber-300 font-mono animate-pulse pointer-events-auto">
            <div className="flex items-center space-x-1.5">
              <VolumeX className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>No audio input detected for 30s. Verify microphone settings.</span>
            </div>
            <button
              onClick={() => { toggleAudioCapture(); setTimeout(toggleAudioCapture, 300); }}
              className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-[10px] text-amber-200 cursor-pointer"
            >
              Restart
            </button>
          </div>
        )}

        {/* ── Tier 3: Paginated Single Q&A Card ── */}
        {!isCardCollapsed && (
          <AnswerPanel
            currentQuestion={displayQuestion}
            streamingAnswer={displayAnswer}
            isGenerating={isGeneratingAnswer || isManualGenerating}
            isAnalyzingScreen={isAnalyzingScreen}
            activeProvider={activeProvider}
            telemetry={telemetry}
            hasActiveCode={Boolean(activeCodeContext?.hasActiveCode)}
            activeCodeTitle={activeCodeContext?.problemTitle}
            // Pagination
            currentIndex={currentIndex}
            totalQuestions={totalQuestions}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrevQuestion={goToPrev}
            onNextQuestion={goToNext}
            onClearCard={handleClearCard}
            // Follow-up & Chat
            onFollowup={handleFollowup}
            onRegenerate={() => handleManualQuestion()}
            onForceGenerate={(text) => handleManualQuestion(text)}
            isChatOpen={isChatOpen}
            onToggleChat={() => setIsChatOpen((prev) => !prev)}
            onClose={() => setIsCardCollapsed(true)}
            // Dynamic Resizing
            onStartResize={handleStartResize}
            panelHeight={panelHeight}
          />
        )}
      </div>

      {/* Candidate Context Modal (Resume + JD) */}
      <ContextModal
        isOpen={isContextModalOpen}
        onClose={() => setIsContextModalOpen(false)}
        onContextUpdated={(updated) => setContextStatus(updated)}
      />
    </div>
  );
}
