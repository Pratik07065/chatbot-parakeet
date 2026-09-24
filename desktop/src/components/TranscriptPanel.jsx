import React, { useRef, useEffect } from 'react';
import { Mic, User, Volume2, ArrowDownCircle, Search } from 'lucide-react';

export default function TranscriptPanel({
  transcripts = [],
  interimTranscript = '',
  isAudioCapturing = false,
  autoScroll = true,
  setAutoScroll
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, interimTranscript, autoScroll]);

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-900/40 rounded-xl border border-white/10 overflow-hidden app-no-drag">
      {/* Panel Sub-header */}
      <div className="px-3.5 py-2 border-b border-white/10 flex items-center justify-between bg-black/20">
        <div className="flex items-center space-x-2">
          <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Live Interviewer Audio Stream
          </h2>
        </div>

        {/* Live Audio Spectrum / VU Meter */}
        <div className="flex items-center space-x-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={`w-0.5 rounded-full transition-all duration-100 ${
                isAudioCapturing
                  ? 'bg-gradient-to-t from-cyan-500 to-indigo-400'
                  : 'bg-slate-700'
              }`}
              style={{
                height: isAudioCapturing
                  ? `${Math.max(4, Math.sin(i * 0.8 + Date.now() * 0.01) * 10 + 12)}px`
                  : '4px',
              }}
            />
          ))}
        </div>
      </div>

      {/* Transcript Scroll Area */}
      <div 
        ref={scrollRef}
        className="flex-1 p-3.5 overflow-y-auto custom-scrollbar space-y-3"
      >
        {transcripts.length === 0 && !interimTranscript && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs text-center p-4">
            <Mic className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
            <p className="font-medium text-slate-400">Listening to interviewer audio...</p>
            <p className="text-[11px] text-slate-600 mt-1 max-w-[220px]">
              Audio captured from system output/loopback will transcribe here in real time.
            </p>
          </div>
        )}

        {/* Finalized Transcript turns */}
        {transcripts.map((turn, idx) => (
          <div 
            key={idx}
            className={`p-2.5 rounded-lg border transition-all ${
              turn.speaker === 'interviewer'
                ? 'bg-slate-900/80 border-cyan-500/20 shadow-sm'
                : 'bg-indigo-950/40 border-indigo-500/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1 text-[10px] font-mono">
              <span className={`font-semibold uppercase tracking-wider flex items-center space-x-1 ${
                turn.speaker === 'interviewer' ? 'text-cyan-400' : 'text-indigo-300'
              }`}>
                <User className="w-2.5 h-2.5 inline mr-1" />
                {turn.speaker === 'interviewer' ? 'Interviewer' : 'You (Candidate)'}
              </span>
              <span className="text-slate-500">{turn.timestamp || 'Just now'}</span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed font-sans select-text">
              {turn.text}
            </p>
          </div>
        ))}

        {/* Live Interim Transcript Stream (Pulsing / streaming) */}
        {interimTranscript && (
          <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/40 shadow-sm animate-pulse">
            <div className="flex items-center justify-between mb-1 text-[10px] font-mono">
              <span className="text-cyan-300 font-semibold uppercase tracking-wider flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping mr-1" />
                Interviewer (Live)
              </span>
              <span className="text-cyan-400/80">Streaming...</span>
            </div>
            <p className="text-xs text-cyan-100 leading-relaxed font-sans select-text">
              {interimTranscript}
              <span className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-1 translate-y-0.5 animate-cursor-blink" />
            </p>
          </div>
        )}
      </div>

      {/* Panel Footer Controls */}
      <div className="px-3 py-1.5 border-t border-white/10 bg-black/30 flex items-center justify-between text-[10px] text-slate-400">
        <span className="font-mono">{transcripts.length} turns recorded</span>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
            autoScroll ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <ArrowDownCircle className="w-3 h-3" />
          <span>Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </div>
  );
}
