import React from 'react';
import {
  Activity,
  FileText,
  FolderClosed,
  Video,
  MessageSquare,
  Gift,
  ChevronDown,
  LogOut,
  AppWindow,
  Sun,
  PanelLeftClose,
  Sparkles,
  Layers,
  Radio
} from 'lucide-react';

export default function Sidebar({
  activeTab = 'sessions',
  setActiveTab,
  sessionCount = 3,
  cvCount = 2,
  docCount = 4,
  isCollapsed = false,
  onToggleCollapse
}) {
  return (
    <aside className={`h-screen border-r border-gray-200 bg-white flex flex-col justify-between select-none transition-all duration-200 z-20 ${
      isCollapsed ? 'w-16 p-2' : 'w-64 p-4'
    }`}>
      {/* ── Top Header & Navigation ── */}
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            {/* Parakeet Parrot Emerald Icon */}
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <Sparkles className="w-4 h-4 fill-white text-white" />
            </div>
            {!isCollapsed && (
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-base tracking-tight text-gray-900">Parakeet AI</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                  PRO
                </span>
              </div>
            )}
          </div>

          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeftClose className={`w-4 h-4 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Section: Workspace */}
        <div>
          {!isCollapsed && (
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">
              Workspace
            </div>
          )}
          <nav className="space-y-1">
            {/* Call Sessions */}
            <button
              onClick={() => setActiveTab('sessions')}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-medium transition-all ${
                activeTab === 'sessions'
                  ? 'bg-emerald-50 text-emerald-800 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
              title="Call Sessions"
            >
              <div className="flex items-center space-x-2.5">
                <Activity className={`w-4 h-4 shrink-0 ${activeTab === 'sessions' ? 'text-emerald-600' : 'text-gray-500'}`} />
                {!isCollapsed && <span>Call Sessions</span>}
              </div>
              {!isCollapsed && sessionCount > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {sessionCount}
                </span>
              )}
            </button>

            {/* CVs & Resumes */}
            <button
              onClick={() => setActiveTab('knowledge')}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-medium transition-all ${
                activeTab === 'knowledge'
                  ? 'bg-emerald-50 text-emerald-800 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
              title="CVs & Resumes"
            >
              <div className="flex items-center space-x-2.5">
                <FileText className={`w-4 h-4 shrink-0 ${activeTab === 'knowledge' ? 'text-emerald-600' : 'text-gray-500'}`} />
                {!isCollapsed && <span>CVs & Resumes</span>}
              </div>
              {!isCollapsed && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {cvCount}
                </span>
              )}
            </button>

            {/* Documents */}
            <button
              onClick={() => setActiveTab('documents')}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg text-xs font-medium transition-all ${
                activeTab === 'documents'
                  ? 'bg-emerald-50 text-emerald-800 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
              title="Documents"
            >
              <div className="flex items-center space-x-2.5">
                <FolderClosed className={`w-4 h-4 shrink-0 ${activeTab === 'documents' ? 'text-emerald-600' : 'text-gray-500'}`} />
                {!isCollapsed && <span>Documents</span>}
              </div>
              {!isCollapsed && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {docCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Section: Support */}
        <div>
          {!isCollapsed && (
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">
              Support
            </div>
          )}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('tutorials')}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2'} rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors`}
              title="Tutorials"
            >
              <div className="flex items-center space-x-2.5">
                <Video className="w-4 h-4 text-gray-500 shrink-0" />
                {!isCollapsed && <span>Tutorials</span>}
              </div>
            </button>

            <button
              onClick={() => setActiveTab('support')}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2'} rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors`}
              title="Support Chat"
            >
              <div className="flex items-center space-x-2.5">
                <MessageSquare className="w-4 h-4 text-gray-500 shrink-0" />
                {!isCollapsed && <span>Support Chat</span>}
              </div>
            </button>
          </nav>
        </div>
      </div>

      {/* ── Bottom Section (Upgrade Card + Profile) ── */}
      <div className="space-y-3 pt-4 border-t border-gray-100">
        {/* Free Plan Card */}
        {!isCollapsed && (
          <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs space-y-2.5">
            <div className="flex items-center space-x-2 text-xs font-bold text-gray-900">
              <Gift className="w-4 h-4 text-emerald-600" />
              <span>Free Plan</span>
            </div>
            <p className="text-[11px] text-gray-500 leading-snug">
              Start a 10 min free session or buy credits for full-length calls.
            </p>
            <button className="w-full py-1.5 px-3 rounded-lg bg-gray-900 hover:bg-black text-white text-xs font-semibold shadow-xs transition-colors">
              Upgrade
            </button>
          </div>
        )}

        {/* Utilities: Theme & App */}
        {!isCollapsed && (
          <div className="space-y-1 text-xs text-gray-500 px-1 font-medium">
            <div className="flex items-center justify-between py-1 cursor-pointer hover:text-gray-800">
              <span className="flex items-center space-x-2">
                <Sun className="w-3.5 h-3.5" />
                <span>Theme</span>
              </span>
              <span className="flex items-center space-x-1 text-[11px] text-gray-400">
                <span>Auto</span>
                <ChevronDown className="w-3 h-3" />
              </span>
            </div>

            <div 
              onClick={() => {
                if (window.electronAPI?.startSession) {
                  window.electronAPI.startSession();
                }
              }}
              className="flex items-center justify-between py-1 cursor-pointer hover:text-gray-800"
            >
              <span className="flex items-center space-x-2">
                <AppWindow className="w-3.5 h-3.5 text-emerald-600" />
                <span>Open Desktop App</span>
              </span>
            </div>
          </div>
        )}

        {/* User Profile Pill */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between px-1">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              PK
            </div>
            {!isCollapsed && (
              <div className="truncate">
                <div className="text-xs font-semibold text-gray-900 truncate">Pratik K.</div>
                <div className="text-[10px] text-gray-400 truncate">pratik@parakeet.ai</div>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <button className="text-gray-400 hover:text-gray-700 p-1" title="Log Out">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
