import React, { useState, useEffect, useRef } from 'react';
import { Maximize2, Minimize2, Send, CornerDownLeft } from 'lucide-react';

/**
 * Tier 2: Active Single-Question Bar
 * Displays the real-time active question stream with a rolling 30-word FIFO buffer,
 * allows manual typing/editing with Enter and Ctrl/Cmd+Enter submission,
 * and provides audio equalizer visualizer and quick controls.
 */
export default function ActiveQuestionBar({
  finalizedText = '',
  questionText = '',
  interimText = '',
  isAudioCapturing = true,
  isGenerating = false,
  lockedQuestion = '',
  isCollapsed = false,
  onToggleCollapse,
  onClearQuestion,
  onAnswerQuestion,
}) {
  const MAX_WORDS = 30;

  // Cleanly display {finalizedText} {interimText} with seamless boundary deduplication
  const confirmed = (finalizedText || questionText || '').trim();
  const transient = (interimText || '').trim();

  let combined = '';
  if (confirmed && transient) {
    if (transient.toLowerCase().startsWith(confirmed.toLowerCase())) {
      combined = transient;
    } else if (confirmed.toLowerCase().endsWith(transient.toLowerCase())) {
      combined = confirmed;
    } else {
      // Check for word boundary overlap between confirmed and transient
      const confWords = confirmed.split(/\s+/);
      const transWords = transient.split(/\s+/);
      let overlap = 0;
      const maxCheck = Math.min(confWords.length, transWords.length);
      for (let len = maxCheck; len >= 1; len--) {
        const confSlice = confWords.slice(confWords.length - len).join(' ').toLowerCase();
        const transSlice = transWords.slice(0, len).join(' ').toLowerCase();
        if (confSlice === transSlice) {
          overlap = len;
          break;
        }
      }
      if (overlap > 0) {
        combined = `${confirmed} ${transWords.slice(overlap).join(' ')}`;
      } else {
        combined = `${confirmed} ${transient}`;
      }
    }
  } else {
    combined = confirmed || transient || '';
  }

  const words = combined.split(/\s+/).filter(Boolean);
  const effectiveText = words.length > MAX_WORDS ? words.slice(words.length - MAX_WORDS).join(' ') : combined;

  const [typedText, setTypedText] = useState(effectiveText);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  // Synchronous display value: instantaneous frame-by-frame rendering when unfocused
  const displayValue = isFocused ? typedText : effectiveText;

  useEffect(() => {
    if (!isFocused) {
      setTypedText(effectiveText);
    }
  }, [effectiveText, isFocused]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const query = (isFocused ? typedText : effectiveText).trim();
    if (!query) return;
    if (onAnswerQuestion) {
      onAnswerQuestion(query);
    }
    if (isFocused && inputRef.current) {
      inputRef.current.blur();
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setTypedText('');
    if (onClearQuestion) {
      onClearQuestion();
    }
  };

  return (
    <div className={`interactive-hud-element bg-[#1c1c20]/95 backdrop-blur-md border ${isGenerating ? 'border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 'border-white/10'} rounded-2xl px-3 py-1.5 flex items-center justify-between shadow-2xl text-white w-full mx-auto mt-1.5 select-none app-no-drag transition-all duration-200 pointer-events-auto`}>
      {/* ── Left: Live Audio Equalizer & Locked State ── */}
      <div className="flex items-center space-x-2 shrink-0 pl-1">
        <div className="flex items-end space-x-0.5 h-4 w-4 justify-center" title={isAudioCapturing ? "Audio Capture Active" : "Audio Paused"}>
          <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-150 ${isAudioCapturing ? 'animate-equalizer-1 h-3' : 'h-1.5 bg-neutral-600'}`} />
          <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-150 ${isAudioCapturing ? 'animate-equalizer-2 h-4' : 'h-2 bg-neutral-600'}`} />
          <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-150 ${isAudioCapturing ? 'animate-equalizer-3 h-2.5' : 'h-1.5 bg-neutral-600'}`} />
          <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-150 ${isAudioCapturing ? 'animate-equalizer-4 h-3.5' : 'h-2 bg-neutral-600'}`} />
        </div>

        {isGenerating && (
          <span className="shrink-0 text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>Active</span>
          </span>
        )}
      </div>

      {/* ── Center: Question Input / Display ── */}
      <div className="flex-1 px-3 overflow-hidden flex items-center">
        <form onSubmit={handleSubmit} className="w-full flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onFocus={() => {
              setIsFocused(true);
              setTypedText(effectiveText);
            }}
            onBlur={() => {
              setIsFocused(false);
              if (!typedText.trim()) {
                setTypedText(effectiveText);
              }
            }}
            onChange={(e) => setTypedText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Type question/code request (e.g. 'write sum of two numbers in python') or speak (⌘↵)..."
            className="w-full bg-transparent border-none text-neutral-100 placeholder-neutral-500 text-xs font-medium focus:outline-none py-0.5 font-sans truncate focus:overflow-visible"
          />
        </form>
      </div>

      {/* ── Right: Clear & Expand/Collapse Controls ── */}
      <div className="flex items-center space-x-1.5 shrink-0 pr-0.5">
        {displayValue.trim() && (
          <button
            type="button"
            onClick={handleSubmit}
            className="p-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-xs active:scale-95 flex items-center space-x-0.5"
            title="Generate Answer / Code (Enter or ⌘↵)"
          >
            <CornerDownLeft className="w-3 h-3" />
          </button>
        )}

        {/* Clear Button (⇧⌘⌫) */}
        <button
          type="button"
          onClick={handleClear}
          disabled={!displayValue.trim()}
          className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/10 text-[11px] font-medium flex items-center space-x-1 transition-colors disabled:opacity-30 cursor-pointer shadow-xs active:scale-95"
          title="Clear current question buffer (⇧⌘⌫)"
        >
          <span>Clear</span>
          <span className="text-[10px] text-neutral-400 font-mono">⇧⌘⌫</span>
        </button>

        {/* Expand / Collapse Answer Card Toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/10 transition-colors cursor-pointer shadow-xs active:scale-95"
          title={isCollapsed ? "Expand Answer Card" : "Collapse Answer Card"}
        >
          {isCollapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
