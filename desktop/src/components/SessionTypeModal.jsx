import React from 'react';
import {
  X,
  Video,
  Mic2,
  ArrowLeft,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Bot
} from 'lucide-react';

export default function SessionTypeModal({
  isOpen,
  onClose,
  onBack,
  onSelectType,
  sessionConfig = {}
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1 -ml-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Back to Session Setup"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-bold text-gray-900">Choose your session type</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500">
            Connect to a real interview call, or practice against an AI interviewer.
          </p>

          <div className="space-y-3">
            {/* Card 1: Real Interview */}
            <div
              onClick={() => onSelectType('real')}
              className="group cursor-pointer p-4 rounded-xl border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all shadow-xs flex items-start space-x-4 relative"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 group-hover:scale-105 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                <Video className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold text-gray-900 group-hover:text-emerald-950">
                    Real interview
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold uppercase">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Connect to your actual interview by capturing system audio loopback and your microphone in real-time.
                </p>
                <div className="flex items-center space-x-3 mt-2 text-[11px] text-gray-400">
                  <span className="flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Undetectable Screen Protection</span>
                  </span>
                  <span>•</span>
                  <span>Sub-second AI Answers</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 absolute right-4 top-1/2 -translate-y-1/2 transition-transform group-hover:translate-x-0.5" />
            </div>

            {/* Card 2: Mock Interview (Beta) */}
            <div
              onClick={() => onSelectType('mock')}
              className="group cursor-pointer p-4 rounded-xl border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all shadow-xs flex items-start space-x-4 relative"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0 group-hover:scale-105 group-hover:bg-purple-600 group-hover:text-white transition-all">
                <Bot className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold text-gray-900 group-hover:text-emerald-950">
                    Mock interview
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-bold uppercase">
                    Beta
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Practice against an AI interviewer tailored to {sessionConfig.company || 'your target role'} and your uploaded resume.
                </p>
                <div className="flex items-center space-x-3 mt-2 text-[11px] text-gray-400">
                  <span className="flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    <span>AI Question Simulation</span>
                  </span>
                  <span>•</span>
                  <span>Live Feedback & Scoring</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 absolute right-4 top-1/2 -translate-y-1/2 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onBack || onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            {onBack ? 'Back' : 'Cancel'}
          </button>
          <div className="text-[11px] text-gray-400">
            Selected: <span className="font-semibold text-gray-700">{sessionConfig?.company || 'General'} ({sessionConfig?.role || 'Interview'})</span>
          </div>
        </div>
      </div>
    </div>
  );
}
