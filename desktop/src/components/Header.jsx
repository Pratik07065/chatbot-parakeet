import React, { useState } from 'react';
import { 
  Radio, 
  ShieldCheck, 
  Zap, 
  Camera, 
  Trash2, 
  Minus, 
  X, 
  Eye, 
  MousePointer, 
  Sparkles,
  ChevronDown,
  Mic,
  MicOff,
  FileText,
  PhoneOff,
  Volume2,
  Repeat,
  Headphones,
  SlidersHorizontal
} from 'lucide-react';

export default function Header({
  isBackendConnected,
  isAudioCapturing,
  sessionTime,
  selectedModel,
  setSelectedModel,
  audioSource = 'both',
  setAudioSource,
  onClear,
  onScreenshot,
  opacity,
  setOpacity,
  clickThrough,
  setClickThrough,
  onMinimize,
  onClose,
  onToggleAudio,
  onOpenContextModal,
  contextStatus,
  onEndSession
}) {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [opacityDropdownOpen, setOpacityDropdownOpen] = useState(false);
  const [audioSourceDropdownOpen, setAudioSourceDropdownOpen] = useState(false);

  const models = [
    { id: 'groq', name: 'Groq Llama 3.3', tag: '⚡ Fastest (<200ms)', provider: 'groq' },
    { id: 'gemini', name: 'Gemini 2.5 Flash', tag: '✨ High Precision', provider: 'gemini' },
    { id: 'openai', name: 'GPT-4o Mini', tag: '🧠 Balanced', provider: 'openai' },
  ];

  const currentModel = models.find(m => m.id === selectedModel) || models[0];

  const audioSources = [
    { id: 'both', name: 'Both (System + Mic)', label: 'Mixed', icon: Repeat, desc: 'Candidate mic + interviewer loopback' },
    { id: 'system', name: 'System Audio Only', label: 'Loopback', icon: Volume2, desc: 'Interviewer audio output only' },
    { id: 'mic', name: 'Microphone Only', label: 'Mic Only', icon: Mic, desc: 'Candidate microphone only' },
  ];

  const currentAudioSource = audioSources.find(a => a.id === audioSource) || audioSources[0];
  const AudioIcon = currentAudioSource.icon;

  return (
    <div className="h-12 px-3 border-b border-white/10 flex items-center justify-between app-drag select-none bg-black/40">
      {/* Left: Brand & Status Indicators */}
      <div className="flex items-center space-x-2.5">
        <div className="flex items-center space-x-1.5 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
          <Radio className={`w-3.5 h-3.5 ${isAudioCapturing ? 'animate-pulse text-emerald-400' : 'text-indigo-400'}`} />
          <span className="text-xs font-bold tracking-wider font-mono">PARAKEET</span>
        </div>

        {/* Backend & Capture Status */}
        <div className="flex items-center space-x-1.5 text-[11px] font-mono">
          <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-full ${
            isBackendConnected 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isBackendConnected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            <span>{isBackendConnected ? 'Live STT' : 'Offline'}</span>
          </div>

          {/* Audio Source Quick Switcher */}
          {setAudioSource && (
            <div className="relative app-no-drag">
              <button
                onClick={() => {
                  setAudioSourceDropdownOpen(!audioSourceDropdownOpen);
                  setModelDropdownOpen(false);
                  setOpacityDropdownOpen(false);
                }}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-500/30 text-[11px] text-cyan-200 transition-colors"
                title={`Active Audio Route: ${currentAudioSource.name} (Click to switch)`}
              >
                <AudioIcon className="w-3 h-3 text-cyan-400" />
                <span className="font-semibold">{currentAudioSource.label}</span>
                <ChevronDown className="w-2.5 h-2.5 text-cyan-400 opacity-70" />
              </button>

              {audioSourceDropdownOpen && (
                <div className="absolute top-full mt-1.5 left-0 w-60 bg-neutral-900/95 backdrop-blur-2xl border border-white/15 rounded-xl shadow-2xl p-1.5 z-50 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 font-mono">Audio Capture Source</div>
                  {audioSources.map(src => {
                    const Icon = src.icon;
                    return (
                      <button
                        key={src.id}
                        onClick={() => {
                          setAudioSource(src.id);
                          setAudioSourceDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                          audioSource === src.id
                            ? 'bg-cyan-600 text-white font-medium'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Icon className="w-3.5 h-3.5 opacity-80" />
                          <div>
                            <div className="font-semibold">{src.name}</div>
                            <div className="text-[10px] text-slate-400 opacity-90">{src.desc}</div>
                          </div>
                        </div>
                        {audioSource === src.id && <span className="text-white font-bold text-xs">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Toggle Capture Button */}
          {onToggleAudio && (
            <button
              onClick={onToggleAudio}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-full border transition-colors app-no-drag ${
                isAudioCapturing
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title={isAudioCapturing ? "Audio Capture Active (Click to Pause)" : "Audio Paused (Click to Resume)"}
            >
              {isAudioCapturing ? (
                <>
                  <Mic className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                  <span>Capturing</span>
                </>
              ) : (
                <>
                  <MicOff className="w-2.5 h-2.5 text-slate-400" />
                  <span>Paused</span>
                </>
              )}
            </button>
          )}

          {/* Undetectable Shield Badge */}
          <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20" title="Window excluded from Screen Share, Zoom & OBS">
            <ShieldCheck className="w-3 h-3 text-violet-400" />
            <span className="text-[10px]">Undetectable</span>
          </div>
        </div>
      </div>

      {/* Center: Session Timer, Context & Active Model Pill */}
      <div className="flex items-center space-x-2">
        {/* Session Timer */}
        <div className="px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300">
          ⏱ {sessionTime}
        </div>

        {/* Resume / JD Context Manager Button */}
        <button
          onClick={onOpenContextModal}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border text-xs transition-colors app-no-drag ${
            contextStatus?.has_resume || contextStatus?.has_job_description
              ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/60'
              : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
          }`}
          title="Manage Resume & Job Description Context"
        >
          <FileText className="w-3 h-3 text-indigo-400" />
          <span>Context</span>
          {(contextStatus?.has_resume || contextStatus?.has_job_description) && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          )}
        </button>

        {/* Model Selector Pill */}
        <div className="relative app-no-drag">
          <button
            onClick={() => {
              setModelDropdownOpen(!modelDropdownOpen);
              setOpacityDropdownOpen(false);
              setAudioSourceDropdownOpen(false);
            }}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/70 border border-indigo-500/30 text-xs text-indigo-200 transition-colors shadow-sm"
          >
            <Zap className="w-3 h-3 text-indigo-400" />
            <span className="font-semibold">{currentModel.name}</span>
            <span className="text-[10px] text-indigo-300/80 font-mono hidden sm:inline">
              ({currentModel.tag.split(' ')[0]})
            </span>
            <ChevronDown className="w-3 h-3 text-indigo-400 opacity-70" />
          </button>

          {modelDropdownOpen && (
            <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 w-56 bg-neutral-900/95 backdrop-blur-2xl border border-white/15 rounded-xl shadow-2xl p-1.5 z-50 space-y-1">
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m.id);
                    setModelDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    selectedModel === m.id 
                      ? 'bg-indigo-600 text-white font-medium' 
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <div>
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-[10px] text-slate-400 opacity-90">{m.tag}</div>
                  </div>
                  {selectedModel === m.id && <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Quick Action Controls, End Session & Window Buttons */}
      <div className="flex items-center space-x-1 app-no-drag">
        {/* End Session Button */}
        {onEndSession && (
          <button
            onClick={onEndSession}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors mr-1"
            title="End Interview & View Debrief Summary"
          >
            <PhoneOff className="w-3 h-3 text-rose-400" />
            <span>End Session</span>
          </button>
        )}

        {/* Opacity Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setOpacityDropdownOpen(!opacityDropdownOpen);
              setModelDropdownOpen(false);
              setAudioSourceDropdownOpen(false);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors"
            title={`Opacity: ${Math.round(opacity * 100)}%`}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {opacityDropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-32 bg-neutral-900/95 backdrop-blur-2xl border border-white/15 rounded-xl shadow-2xl p-2 z-50 space-y-1 text-xs">
              <div className="text-[10px] uppercase font-bold text-slate-400 px-1 mb-1 font-mono">HUD Opacity</div>
              {[1.0, 0.95, 0.75, 0.55].map((op) => (
                <button
                  key={op}
                  onClick={() => {
                    setOpacity(op);
                    setOpacityDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex justify-between ${
                    opacity === op ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span>{Math.round(op * 100)}%</span>
                  {opacity === op && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Click-Through Mode Toggle */}
        <button
          onClick={() => setClickThrough(!clickThrough)}
          className={`p-1.5 rounded-lg transition-colors ${
            clickThrough 
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
              : 'text-slate-400 hover:text-slate-100 hover:bg-white/10'
          }`}
          title={clickThrough ? "Click-Through Active (Alt+X to exit)" : "Enable Click-Through (Alt+X)"}
        >
          <MousePointer className="w-3.5 h-3.5" />
        </button>

        {/* Screenshot (Ctrl+Shift+S) */}
        <button
          onClick={onScreenshot}
          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-white/10 transition-colors"
          title="Take Screenshot Snip (Ctrl+Shift+S)"
        >
          <Camera className="w-3.5 h-3.5" />
        </button>

        {/* Clear (Ctrl+K) */}
        <button
          onClick={onClear}
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-white/10 transition-colors"
          title="Clear Stream (Ctrl+K)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-[1px] h-4 bg-white/10 mx-1" />

        {/* Minimize */}
        <button
          onClick={onMinimize}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
          title="Close Overlay"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
