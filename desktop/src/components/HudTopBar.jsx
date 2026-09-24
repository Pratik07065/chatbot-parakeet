import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Volume2,
  Camera,
  MessageSquare,
  Zap,
  MoreVertical,
  Move,
  Minimize2,
  Maximize2,
  PhoneOff,
  Sparkles,
  FileText,
  MousePointer,
  RefreshCw,
  Repeat,
  AlertTriangle,
  Loader2
} from 'lucide-react';

/**
 * Tier 1: Top Floating Control Bar
 * Exactly replicating the Parakeet AI top control bar from reference design.
 */
export default function HudTopBar({
  isBackendConnected = true,
  isAudioCapturing = true,
  audioStatus = null,
  audioLevel = 0,
  systemAudioStatus = null,
  sessionTime = '00:00:00',
  sessionSeconds = 0,
  selectedModel = 'groq',
  setSelectedModel,
  audioSource = 'both',
  setAudioSource,
  onScreenshot,
  onForceGenerate,
  onToggleChat,
  isChatOpen = false,
  isAnalyzingScreen = false,
  screenAnalysisStatus = '⚡ Reading screen...',
  opacity = 0.95,
  setOpacity,
  clickThrough = false,
  setClickThrough,
  onMinimize,
  onEndSession,
  onToggleAudio,
  onOpenContextModal,
  contextStatus,
  hudWidth = 650,
  onSetHudWidth,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Derive visual audio status
  const effectiveStatus = audioStatus || (isAudioCapturing ? 'Mic Live' : 'Muted');
  const isError = effectiveStatus.includes('Error') || effectiveStatus.includes('Denied') || effectiveStatus.includes('Failed');
  const isConnecting = effectiveStatus === 'Connecting...';
  const isLive = effectiveStatus === 'Mic Live' || (!isError && !isConnecting && isAudioCapturing);

  // Derive visual system loopback audio status
  const isSystemDisabled = audioSource === 'mic';
  const isSystemLoopbackActive = Boolean(systemAudioStatus?.loopbackActive);
  const isSystemAudioProducingSound = Boolean(systemAudioStatus?.isActive || (systemAudioStatus?.rms && systemAudioStatus.rms > 0.002));
  const systemDeviceName = systemAudioStatus?.deviceName || 'System Loopback';
  const systemSampleRate = systemAudioStatus?.sampleRate || 48000;
  const systemRms = systemAudioStatus?.rms || 0;

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const models = [
    { id: 'groq', name: 'Groq Llama 3.3', tag: '⚡ Fastest (<200ms)' },
    { id: 'gemini', name: 'Gemini 2.5 Flash', tag: '✨ High Precision / Vision' },
    { id: 'openai', name: 'GPT-4o Mini', tag: '🧠 Balanced' },
  ];

  const audioSources = [
    { id: 'both', name: 'Both (System + Mic)', icon: Repeat, desc: 'Candidate mic + interviewer loopback' },
    { id: 'system', name: 'System Audio Only', icon: Volume2, desc: 'Interviewer audio loopback only' },
    { id: 'mic', name: 'Microphone Only', icon: Mic, desc: 'Candidate microphone only' },
  ];

  return (
    <div
      className="interactive-hud-element bg-[#1c1c20]/95 border border-white/10 text-white shadow-2xl backdrop-blur-md rounded-2xl px-3 py-1.5 flex items-center justify-between app-drag select-none w-full mx-auto relative z-50 transition-all pointer-events-auto"
      style={{ WebkitAppRegion: 'drag' }}
    >
      {/* ── 1. Left: Audio & Microphone Status & Live Volume Meter ── */}
      <div className="flex items-center space-x-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Candidate Microphone Button & Meter */}
        <button
          type="button"
          onClick={onToggleAudio}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl border transition-all cursor-pointer shadow-xs max-w-[170px] truncate ${
            isError
              ? 'bg-rose-950/60 border-rose-500/50 text-rose-300 hover:bg-rose-900/70 animate-pulse'
              : isConnecting
              ? 'bg-amber-950/50 border-amber-500/40 text-amber-300 hover:bg-amber-900/60'
              : isLive
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50'
              : 'bg-neutral-800/80 border-white/10 text-neutral-400 hover:bg-neutral-700/80 hover:text-white'
          }`}
          title={
            isError
              ? `⚠️ ${effectiveStatus} (Click to restart audio)`
              : isLive
              ? `🎙️ Mic Live & Streaming (Volume: ${audioLevel}%) (Click to pause)`
              : "Audio Capture Paused (Click to resume)"
          }
        >
          <div className="relative flex items-center justify-center shrink-0">
            {isError ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            ) : isConnecting ? (
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            ) : (
              <Mic className={`w-3.5 h-3.5 ${isLive ? 'text-emerald-400' : 'text-neutral-400'}`} />
            )}
            <span
              className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
                isError
                  ? 'bg-rose-500'
                  : isConnecting
                  ? 'bg-amber-400 animate-ping'
                  : isLive
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-neutral-500'
              }`}
            />
          </div>
          <span className="text-[11px] font-semibold tracking-tight truncate">
            {effectiveStatus}
          </span>

          {/* Real-Time Green Audio Volume Meter */}
          {isLive && (
            <div className="flex items-end gap-[2px] ml-1 h-3 px-1 bg-black/40 rounded-md py-[1px]">
              {[10, 25, 50, 75].map((threshold, idx) => {
                const active = audioLevel >= threshold;
                return (
                  <div
                    key={idx}
                    className={`w-[2.5px] rounded-full transition-all duration-75 ${
                      active
                        ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]'
                        : 'bg-emerald-950/80'
                    }`}
                    style={{ height: `${(idx + 1) * 25}%` }}
                  />
                );
              })}
            </div>
          )}
        </button>

        {/* System Audio WASAPI Loopback Status Indicator */}
        <div
          className={`flex items-center space-x-1 px-2 py-1 rounded-xl border transition-all text-[11px] font-semibold shadow-xs max-w-[150px] truncate ${
            isSystemDisabled
              ? 'bg-neutral-800/40 border-white/5 text-neutral-500'
              : isSystemAudioProducingSound
              ? 'bg-cyan-950/50 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
              : isSystemLoopbackActive
              ? 'bg-cyan-950/30 border-cyan-500/25 text-cyan-400/90'
              : 'bg-neutral-800/80 border-white/10 text-neutral-400'
          }`}
          title={
            isSystemDisabled
              ? 'System audio loopback disabled (Microphone Only mode)'
              : isSystemAudioProducingSound
              ? `🔊 System Audio: Active (Sound detected, RMS: ${systemRms.toFixed(4)}) - ${systemDeviceName} @ ${systemSampleRate}Hz`
              : isSystemLoopbackActive
              ? `🔊 System Audio: Idle (Capturing output: ${systemDeviceName} @ ${systemSampleRate}Hz)`
              : '🔊 System Audio: Standby'
          }
        >
          <div className="relative flex items-center justify-center shrink-0">
            <Volume2 className={`w-3.5 h-3.5 ${
              isSystemDisabled
                ? 'text-neutral-500'
                : isSystemAudioProducingSound
                ? 'text-cyan-300 animate-pulse'
                : isSystemLoopbackActive
                ? 'text-cyan-400'
                : 'text-neutral-400'
            }`} />
            {!isSystemDisabled && isSystemLoopbackActive && (
              <span
                className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
                  isSystemAudioProducingSound ? 'bg-cyan-400 animate-ping' : 'bg-cyan-500'
                }`}
              />
            )}
          </div>
          <span className="truncate">
            {isSystemDisabled ? 'Sys: Off' : isSystemAudioProducingSound ? 'Sys: Active' : isSystemLoopbackActive ? 'Sys: Idle' : 'Sys: Standby'}
          </span>
        </div>
      </div>

      {/* ── 2. Center: Action Pills (Answer, Screenshot, Chat) ── */}
      <div className="flex items-center space-x-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Action 1: "Answer ⌘↵" */}
        <button
          type="button"
          onClick={onForceGenerate}
          className="bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs px-3 py-1 rounded-xl border border-white/10 flex items-center space-x-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
          title="Force Answer Generation for current question (⌘↵)"
        >
          <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
          <span>Answer</span>
          <span className="text-[10px] text-neutral-400 font-mono">⌘↵</span>
        </button>

        {/* Action 2: "Screenshot ⇧⌘↵" (Ultra-Fast Screen OCR & Solve) */}
        <button
          type="button"
          onClick={onScreenshot}
          disabled={isAnalyzingScreen}
          className={`bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs px-3 py-1 rounded-xl border border-white/10 flex items-center space-x-1.5 transition-all shadow-xs active:scale-95 cursor-pointer ${
            isAnalyzingScreen ? 'opacity-90 border-amber-500/50 bg-amber-950/40 text-amber-300' : ''
          }`}
          title="Fast screen OCR solve (<1s with Groq LLaMA 3.3) (⇧⌘↵ or ⇧⌘S)"
        >
          {isAnalyzingScreen ? (
            <>
              <Zap className="w-3 h-3 text-amber-400 animate-pulse fill-amber-400" />
              <span className="text-amber-300 font-semibold">{screenAnalysisStatus || '⚡ Reading screen...'}</span>
            </>
          ) : (
            <>
              <Camera className="w-3 h-3 text-emerald-400" />
              <span>Screenshot</span>
              <span className="text-[10px] text-neutral-400 font-mono">⇧⌘↵</span>
            </>
          )}
        </button>

        {/* Action 3: "Chat ⇧⌘D" */}
        <button
          type="button"
          onClick={onToggleChat}
          className={`bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs px-3 py-1 rounded-xl border border-white/10 flex items-center space-x-1.5 transition-all shadow-xs active:scale-95 cursor-pointer ${
            isChatOpen ? 'bg-indigo-950/60 border-indigo-500/40 text-indigo-300' : ''
          }`}
          title="Toggle Contextual Chat / Follow-up Input (⇧⌘D)"
        >
          <MessageSquare className="w-3 h-3 text-indigo-400" />
          <span>Chat</span>
          <span className="text-[10px] text-neutral-400 font-mono">⇧⌘D</span>
        </button>
      </div>

      {/* ── 3. Right: Window Grip, Options, End ── */}
      <div className="flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' }}>
        {/* Drag Handle Grip Icon (✛) */}
        <div
          className="p-1 rounded-lg text-neutral-400 hover:text-white cursor-grab active:cursor-grabbing transition-colors"
          style={{ WebkitAppRegion: 'drag' }}
          title="Drag to reposition floating overlay"
        >
          <Move className="w-3.5 h-3.5" />
        </div>

        {/* Minimize / Resize Toggle (⤢) */}
        <button
          type="button"
          onClick={onMinimize}
          className="p-1 rounded-lg text-neutral-400 hover:text-white transition-colors cursor-pointer"
          title="Minimize overlay (Click tray icon to restore)"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>

        {/* More Options Menu Button (⋮) */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded-lg text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Options & Settings"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-neutral-900/98 border border-white/15 rounded-xl shadow-2xl p-2 z-50 space-y-1.5 backdrop-blur-2xl text-xs animate-in fade-in zoom-in-95 duration-100">
              {/* Context Modal Trigger */}
              {onOpenContextModal && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenContextModal();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-neutral-300 hover:bg-white/10 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-2">
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Candidate Context</span>
                  </div>
                  {contextStatus?.has_resume && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  )}
                </button>
              )}

              {/* Audio Source Routing Switcher */}
              <div className="border-t border-white/10 pt-1">
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 py-0.5">
                  Audio Routing
                </div>
                {audioSources.map((src) => {
                  const Icon = src.icon;
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => {
                        if (setAudioSource) setAudioSource(src.id);
                        setMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                        audioSource === src.id
                          ? 'bg-emerald-600/30 text-emerald-300 font-semibold'
                          : 'text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Icon className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="truncate">{src.name}</span>
                      </div>
                      {audioSource === src.id && <span className="text-emerald-400 font-bold">✓</span>}
                    </button>
                  );
                })}
              </div>

              {/* Model Switcher */}
              <div className="border-t border-white/10 pt-1">
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 py-0.5">
                  AI Model
                </div>
                {models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      if (setSelectedModel) setSelectedModel(m.id);
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                      selectedModel === m.id
                        ? 'bg-indigo-600/30 text-indigo-300 font-semibold'
                        : 'text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    <span>{m.name}</span>
                    {selectedModel === m.id && <span className="text-indigo-400 font-bold">✓</span>}
                  </button>
                ))}
              </div>

              {/* HUD Window Size Presets */}
              <div className="border-t border-white/10 pt-1">
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 py-0.5">
                  Window Size
                </div>
                <div className="grid grid-cols-3 gap-1 px-1 py-1">
                  {[
                    { label: '📱 Compact', width: 450 },
                    { label: '💻 Normal', width: 650 },
                    { label: '🖥️ Wide', width: 850 },
                  ].map((preset) => (
                    <button
                      key={preset.width}
                      type="button"
                      onClick={() => {
                        if (onSetHudWidth) onSetHudWidth(preset.width);
                        setMenuOpen(false);
                      }}
                      className={`px-1.5 py-1 rounded text-[10px] font-medium transition-all text-center cursor-pointer ${
                        hudWidth === preset.width
                          ? 'bg-emerald-600/40 text-emerald-300 font-bold border border-emerald-500/40'
                          : 'bg-neutral-800/80 hover:bg-neutral-700/80 text-neutral-300 border border-white/5'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity & Click-Through Controls */}
              <div className="border-t border-white/10 pt-1">
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 py-0.5">
                  HUD Window
                </div>
                <div className="flex items-center justify-between px-2 py-1 text-neutral-300">
                  <span>Opacity</span>
                  <div className="flex items-center space-x-1">
                    {[1.0, 0.85, 0.65].map((op) => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => setOpacity && setOpacity(op)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                          opacity === op ? 'bg-emerald-600 text-white font-bold' : 'bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {Math.round(op * 100)}%
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (setClickThrough) setClickThrough(!clickThrough);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-neutral-300 hover:bg-white/10 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-2">
                    <MousePointer className="w-3.5 h-3.5 text-amber-400" />
                    <span>Click-Through (Alt+X)</span>
                  </div>
                  <span className={`text-[10px] font-bold ${clickThrough ? 'text-emerald-400' : 'text-neutral-500'}`}>
                    {clickThrough ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* End Red Pill Button */}
        <button
          type="button"
          onClick={onEndSession}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs px-3 py-1 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center space-x-1"
          title="Exit session and review notes"
        >
          <span>End</span>
        </button>
      </div>
    </div>
  );
}
