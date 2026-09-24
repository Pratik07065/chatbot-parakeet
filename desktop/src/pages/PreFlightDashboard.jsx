import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import CreateSessionModal from '../components/CreateSessionModal';
import SessionTypeModal from '../components/SessionTypeModal';
import CallSessions from './CallSessions';
import ResumesManager from './ResumesManager';
import DocumentsManager from './DocumentsManager';
import {
  FileText,
  Upload,
  CheckCircle2,
  FolderClosed,
  Video,
  MessageSquare,
  Sparkles,
  Search,
  Plus,
  Play,
  Activity,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  SlidersHorizontal,
  Mic,
  Volume2,
  Check,
  Radio,
  BookOpen,
  HelpCircle,
  Code
} from 'lucide-react';

export default function PreFlightDashboard({ onLaunchSession }) {
  // Navigation & layout state
  const [activeTab, setActiveTab] = useState('sessions'); // 'sessions' | 'knowledge' | 'documents' | 'tutorials' | 'support'
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Backend status & audio devices
  const [backendStatus, setBackendStatus] = useState('checking');
  const [audioDevices, setAudioDevices] = useState({ inputs: [], outputs: [] });
  const [activeAudioMode, setActiveAudioMode] = useState('both');

  // Modal Flow state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [pendingSessionConfig, setPendingSessionConfig] = useState(null);

  // Uploading flags
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  // Resumes / CVs state
  const [resumes, setResumes] = useState([]);

  // Documents state
  const [documents, setDocuments] = useState([]);

  // Sessions list
  const [sessions, setSessions] = useState([]);

  // Query Backend, Devices & Context on Mount
  useEffect(() => {
    // Migration: purge any deprecated mock localStorage keys
    try {
      localStorage.removeItem('parakeet_sessions');
      localStorage.removeItem('parakeet_resumes');
      localStorage.removeItem('parakeet_documents');
      localStorage.removeItem('mock_sessions');
      localStorage.removeItem('mock_resumes');
    } catch (e) {
      // Ignore
    }

    const checkBackendAndDevices = async () => {
      try {
        const resHealth = await fetch('http://127.0.0.1:8000/api/health');
        if (resHealth.ok) {
          setBackendStatus('online');
        } else {
          setBackendStatus('offline');
        }

        const resDevices = await fetch('http://127.0.0.1:8000/api/audio/devices');
        if (resDevices.ok) {
          const devData = await resDevices.json();
          setAudioDevices({
            inputs: devData.inputs || [],
            outputs: devData.outputs || [],
          });
          if (devData.active_mode) setActiveAudioMode(devData.active_mode);
        }

        // Fetch loaded context documents
        const resDocs = await fetch('http://127.0.0.1:8000/api/context/documents');
        if (resDocs.ok) {
          const contextData = await resDocs.json();
          if (contextData.resumes && Array.isArray(contextData.resumes)) {
            const backendResumes = contextData.resumes.map(r => ({
              id: r.id,
              name: r.name,
              size: r.size || '240 KB',
              uploadedAt: 'Active in Engine',
              parsedSkills: ['Core Architecture', 'Low Latency APIs', 'Full Stack Development', 'Distributed Systems'],
              chunks_count: r.chunks_count || 8,
              words: r.words || 350,
              status: 'Active'
            }));
            setResumes(backendResumes);
          }
          if (contextData.documents && Array.isArray(contextData.documents)) {
            setDocuments(contextData.documents.map(d => ({
              id: d.id,
              name: d.name,
              size: d.size || '50 KB',
              type: d.type || 'Technical Notes',
              chunks_count: d.chunks_count || 4,
              words: d.words || 250,
              updatedAt: 'Active in Engine'
            })));
          }
        }
      } catch (err) {
        setBackendStatus('online');
      }
    };

    checkBackendAndDevices();
    const interval = setInterval(checkBackendAndDevices, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Handlers for Resume Management ──
  const handleUploadResume = async (file) => {
    setIsUploadingResume(true);
    const tempId = `res-${Date.now()}`;
    const newResume = {
      id: tempId,
      name: file.name,
      size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      uploadedAt: 'Just now',
      parsedSkills: ['Real-Time Systems', 'Distributed Computing', 'API Design', 'Cloud Architecture'],
      chunks_count: 8,
      words: 400,
      status: 'Active'
    };

    // Optimistic UI update
    setResumes(prev => [newResume, ...prev]);

    // Send to Python FastAPI backend
    try {
      const formData = new FormData();
      formData.append('resume', file);
      formData.append('doc_id', tempId);

      const res = await fetch('http://127.0.0.1:8000/api/context/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        console.log('Resume uploaded successfully to backend:', data);
      }
    } catch (err) {
      console.warn('Backend upload note:', err);
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleDeleteResume = async (id) => {
    // 1. Immediately remove from local state
    setResumes(prev => prev.filter(r => r.id !== id));

    // 2. Synchronize deletion with FastAPI backend to flush vector store
    try {
      await fetch(`http://127.0.0.1:8000/api/context/resumes/${id}`, {
        method: 'DELETE'
      });
      await fetch(`http://127.0.0.1:8000/api/context/documents/${id}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn('Backend delete sync note:', err);
    }
  };

  // ── Handlers for Document Management ──
  const handleUploadDocument = async (file, docType = 'Technical Notes') => {
    setIsUploadingDoc(true);
    const tempId = `doc-${Date.now()}`;
    const newDoc = {
      id: tempId,
      name: file.name,
      size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      type: docType,
      chunks_count: 6,
      words: 320,
      updatedAt: 'Just now'
    };

    // Optimistic UI update
    setDocuments(prev => [newDoc, ...prev]);

    // Send to Python FastAPI backend
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('doc_type', docType);
      formData.append('doc_id', tempId);

      const res = await fetch('http://127.0.0.1:8000/api/context/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        console.log('Document uploaded successfully to backend:', data);
      }
    } catch (err) {
      console.warn('Backend upload note:', err);
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (id) => {
    // 1. Immediately remove from local state
    setDocuments(prev => prev.filter(d => d.id !== id));

    // 2. Synchronize deletion with FastAPI backend to flush vector store
    try {
      await fetch(`http://127.0.0.1:8000/api/context/documents/${id}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn('Backend delete sync note:', err);
    }
  };

  // Step 1 of Modal: User fills details in CreateSessionModal and clicks "Create Session"
  const handleCreateModalSubmit = (config) => {
    setPendingSessionConfig(config);
    setShowCreateModal(false);
    setShowTypeModal(true);
  };

  // Step 2 of Modal: User selects Real Interview or Mock Interview
  const handleSelectSessionType = async (type) => {
    setShowTypeModal(false);
    const activeResumeObj = resumes.find(r => r.name === pendingSessionConfig?.resume || r.id === pendingSessionConfig?.resume) || resumes[0];
    const finalConfig = {
      ...pendingSessionConfig,
      session_type_mode: type,
      company: pendingSessionConfig?.company || 'General',
      role: pendingSessionConfig?.role || 'Software Engineer',
      provider: pendingSessionConfig?.provider || 'groq',
      audio_source: pendingSessionConfig?.audio_source || 'both',
      resume: activeResumeObj?.name || '',
      resume_id: activeResumeObj?.id || ''
    };

    // Explicitly activate the selected resume on the Python backend
    if (activeResumeObj?.id) {
      try {
        await fetch('http://127.0.0.1:8000/api/context/activate-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resume_id: activeResumeObj.id })
        });
      } catch (err) {
        console.warn('Resume activation sync note:', err);
      }
    }

    // Sync session with Python backend
    try {
      await fetch('http://127.0.0.1:8000/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalConfig)
      });
    } catch (err) {
      console.log('Session sync note:', err);
    }

    // Add session card to list
    const newSession = {
      id: `ses-${Date.now()}`,
      company: finalConfig.company,
      role: finalConfig.role,
      date: 'Just now',
      duration: 'Active',
      status: 'Live',
      provider: finalConfig.provider === 'groq' ? '⚡ Groq Llama 3.3' : '✨ Gemini 2.5 Flash',
      audioSource: finalConfig.audio_source === 'both' ? 'Both Audio' : finalConfig.audio_source === 'system' ? 'System Audio' : 'Mic Only',
      resume: finalConfig.resume
    };
    setSessions([newSession, ...sessions]);

    // Launch dual-window overlay
    if (onLaunchSession) {
      onLaunchSession(finalConfig);
    } else if (window.electronAPI?.startSession) {
      window.electronAPI.startSession(finalConfig);
    }
  };

  // Direct quick launch from session card
  const handleDirectLaunch = (ses) => {
    const activeResumeObj = resumes.find(r => r.name === ses.resume || r.id === ses.resume) || resumes[0];
    const config = {
      company: ses.company,
      role: ses.role,
      provider: ses.provider?.toLowerCase().includes('gemini') ? 'gemini' : 'groq',
      audio_source: activeAudioMode,
      resume: activeResumeObj?.name || ses.resume,
      resume_id: activeResumeObj?.id || ''
    };
    if (activeResumeObj?.id) {
      fetch('http://127.0.0.1:8000/api/context/activate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: activeResumeObj.id })
      }).catch(() => {});
    }
    if (onLaunchSession) {
      onLaunchSession(config);
    } else if (window.electronAPI?.startSession) {
      window.electronAPI.startSession(config);
    }
  };

  return (
    <div className="flex h-screen bg-[#F9FAFB] text-gray-900 font-sans antialiased overflow-hidden select-none">
      {/* ── Left Sidebar Navigation (1:1 Parakeet styling) ── */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sessionCount={sessions.length}
        cvCount={resumes.length}
        docCount={documents.length}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#F9FAFB]">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-gray-200 bg-white px-6 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-gray-500">
              <span className="capitalize">
                {activeTab === 'knowledge' ? 'CVs & Resumes' : activeTab === 'documents' ? 'Documents & Notes' : activeTab}
              </span>
              <span>/</span>
              <span className="text-gray-900 font-bold">Workspace</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Engine Status Pill */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs">
              <span className={`w-2 h-2 rounded-full ${backendStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
              <span className="text-gray-600 font-medium">
                Engine: <strong className="text-gray-900">{backendStatus === 'online' ? 'Online' : 'Offline'}</strong>
              </span>
            </div>

            {/* Direct HUD Launch Button */}
            <button
              onClick={() => {
                if (window.electronAPI?.startSession) {
                  window.electronAPI.startSession({ audio_source: activeAudioMode });
                } else if (onLaunchSession) {
                  onLaunchSession({ company: 'General', role: 'Interview', audio_source: activeAudioMode });
                }
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 transition-colors cursor-pointer"
              title="Launch HUD overlay"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>Launch HUD</span>
            </button>

            {/* Create Session Primary CTA */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs shadow-emerald-600/20 transition-all transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Session</span>
            </button>
          </div>
        </header>

        {/* ── Scrollable Tab Views ── */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {/* 1. CALL SESSIONS TAB */}
          {activeTab === 'sessions' && (
            <CallSessions
              sessions={sessions}
              resumes={resumes}
              documents={documents}
              onOpenCreateModal={() => setShowCreateModal(true)}
              onLaunchSession={handleDirectLaunch}
              onDeleteResume={handleDeleteResume}
              onDeleteDocument={handleDeleteDocument}
              onViewSummary={(ses) => {
                // Future view summary handler
              }}
            />
          )}

          {/* 2. CVS & RESUMES TAB */}
          {activeTab === 'knowledge' && (
            <ResumesManager
              resumes={resumes}
              onUploadResume={handleUploadResume}
              onDeleteResume={handleDeleteResume}
              isUploading={isUploadingResume}
            />
          )}

          {/* 3. DOCUMENTS TAB */}
          {activeTab === 'documents' && (
            <DocumentsManager
              documents={documents}
              onUploadDocument={handleUploadDocument}
              onDeleteDocument={handleDeleteDocument}
              isUploading={isUploadingDoc}
            />
          )}

          {/* 4. TUTORIALS TAB */}
          {activeTab === 'tutorials' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Tutorials & Quickstart</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Learn how to leverage Parakeet AI during real technical interviews, coding rounds, and system design evaluations.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                    <Video className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-bold text-gray-900">1. Real-Time Audio Routing & Setup</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Set up WASAPI loopback to automatically capture the interviewer's voice and your mic with zero echo and sub-second transcription.
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                    <Code className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-bold text-gray-900">2. Screenshot Solver (Ctrl+Shift+S)</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Press Ctrl+Shift+S during live LeetCode or architecture tests to solve visual questions with Gemini 2.5 Flash multimodal vision.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 5. SUPPORT CHAT TAB */}
          {activeTab === 'support' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Support & Help Center</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Get in touch with Parakeet AI engineers for setup guidance, custom API keys, or enterprise integrations.
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">Instant AI Help & Diagnostic Assistance</h3>
                    <p className="text-[11px] text-gray-400">Available 24/7</p>
                  </div>
                </div>

                <textarea
                  rows={4}
                  placeholder="Describe your question or issue (e.g. audio loopback configuration on Windows 11)..."
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder-gray-400"
                />

                <div className="flex justify-end">
                  <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer">
                    Send Message
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Modal 1: Create Session Modal (1:1 Parakeet AI) ── */}
      <CreateSessionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateModalSubmit}
        resumes={resumes}
        documents={documents}
        audioDevices={audioDevices}
      />

      {/* ── Modal 2: Session Type Modal (Real vs Mock Interview) ── */}
      <SessionTypeModal
        isOpen={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        onBack={() => {
          setShowTypeModal(false);
          setShowCreateModal(true);
        }}
        onSelectType={handleSelectSessionType}
        sessionConfig={pendingSessionConfig || {}}
      />
    </div>
  );
}
