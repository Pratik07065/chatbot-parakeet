import React, { useState, useEffect } from 'react';
import {
  X,
  Info,
  Sparkles,
  ChevronDown,
  FileText,
  FolderClosed,
  Plus,
  Zap,
  Globe,
  MessageSquare,
  Repeat,
  Volume2,
  Mic,
  SlidersHorizontal,
  Check,
  CheckCircle2,
  Play
} from 'lucide-react';

export default function CreateSessionModal({
  isOpen,
  onClose,
  onSubmit,
  resumes = [],
  documents = [],
  audioDevices = { inputs: [], outputs: [] }
}) {
  if (!isOpen) return null;

  // Session Form State
  const [sessionType, setSessionType] = useState('interview'); // 'interview' | 'call'
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  
  // Context & Models
  const [selectedResume, setSelectedResume] = useState(resumes[0]?.name || '');
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [customInstructions, setCustomInstructions] = useState('');
  const [showInstructionsInput, setShowInstructionsInput] = useState(false);
  const [selectedModel, setSelectedModel] = useState('groq');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [selectedAnswerPref, setSelectedAnswerPref] = useState('Concise Speaking Cues');
  
  // Audio Routing
  const [audioSource, setAudioSource] = useState('both'); // 'both' | 'system' | 'mic'
  const [selectedMicId, setSelectedMicId] = useState(null);
  const [selectedLoopbackId, setSelectedLoopbackId] = useState(null);
  const [showAdvancedAudio, setShowAdvancedAudio] = useState(false);

  // Checkboxes
  const [autoAnswer, setAutoAnswer] = useState(false);
  const [saveTranscript, setSaveTranscript] = useState(true);

  // Dropdown states
  const [resumeDropdownOpen, setResumeDropdownOpen] = useState(false);
  const [docsDropdownOpen, setDocsDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // Synchronize resume selection if list changes
  useEffect(() => {
    if (resumes.length > 0) {
      if (!selectedResume || !resumes.some(r => r.name === selectedResume)) {
        setSelectedResume(resumes[0].name);
      }
    } else {
      setSelectedResume('');
    }
  }, [resumes]);

  const models = [
    { id: 'groq', name: '⚡ Groq (Llama 3.3)', desc: 'Ultra-low latency (<200ms TTFT)' },
    { id: 'gemini', name: '✨ Google Gemini 2.5 Flash', desc: 'Fast reasoning & Vision solver' },
    { id: 'openai', name: '🧠 OpenAI GPT-4o Mini', desc: 'Balanced standard model' },
  ];

  const currentModelObj = models.find(m => m.id === selectedModel) || models[0];

  const toggleDocSelection = (docName) => {
    if (selectedDocs.includes(docName)) {
      setSelectedDocs(selectedDocs.filter(d => d !== docName));
    } else {
      setSelectedDocs([...selectedDocs, docName]);
    }
  };

  const handleCreate = () => {
    onSubmit({
      sessionType,
      company: company.trim() || 'General',
      role: role.trim() || 'Software Engineer',
      description: description.trim(),
      resume: selectedResume,
      documents: selectedDocs,
      customInstructions,
      provider: selectedModel,
      language: selectedLanguage,
      answerPreference: selectedAnswerPref,
      audio_source: audioSource,
      mic_id: selectedMicId,
      system_id: selectedLoopbackId,
      autoAnswer,
      saveTranscript,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* ── Modal Header ── */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold text-gray-900">Create Session</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Modal Scrollable Body ── */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* 1. Session Type Segmented Pill */}
          <div className="p-1 bg-gray-100 rounded-xl flex items-center">
            <button
              type="button"
              onClick={() => setSessionType('interview')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                sessionType === 'interview'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span>💼 Interview</span>
            </button>
            <button
              type="button"
              onClick={() => setSessionType('call')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                sessionType === 'call'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span>📞 Regular Call</span>
            </button>
          </div>

          {/* 2. Company & Auto-fill Link */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700 flex items-center space-x-1">
                <span>Company</span>
                <Info className="w-3 h-3 text-gray-400" />
              </label>
              <button
                type="button"
                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center space-x-0.5 cursor-pointer"
                onClick={() => {
                  setCompany('Google');
                  setRole('Staff Software Engineer');
                  setDescription('Leading scalable distributed services, high-concurrency microservices, and real-time streaming architectures.');
                }}
              >
                <span>✨ Fill fields from Job Post URL →</span>
              </button>
            </div>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Inc..."
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder-gray-400"
            />
          </div>

          {/* 3. Interview Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Target Role / Position
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder-gray-400"
            />
          </div>

          {/* 4. Interview Description */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 flex items-center space-x-1">
              <span>Interview Description</span>
              <Info className="w-3 h-3 text-gray-400" />
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Software Engineer versed in Python, SQL, and AWS..."
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none placeholder-gray-400"
            />
          </div>

          {/* 5. Context Badges Row */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Knowledge Context & Files
            </label>
            <div className="flex flex-wrap gap-2">
              {/* Selected Resume Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setResumeDropdownOpen(!resumeDropdownOpen);
                    setDocsDropdownOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer ${
                    selectedResume
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <FileText className="w-3 h-3 text-emerald-600" />
                  <span className="truncate max-w-[140px]">{selectedResume || '+ Add Resume'}</span>
                  <ChevronDown className="w-3 h-3 text-emerald-600" />
                </button>

                {resumeDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg p-1 z-30 space-y-1">
                    {resumes.length === 0 ? (
                      <div className="p-3 text-center text-xs text-gray-400">
                        No resumes uploaded yet.<br />
                        <span className="text-[10px] text-gray-400">Upload in CVs & Resumes tab</span>
                      </div>
                    ) : (
                      resumes.map(r => (
                        <button
                          key={r.id || r.name}
                          type="button"
                          onClick={() => {
                            setSelectedResume(r.name);
                            setResumeDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer ${
                            selectedResume === r.name
                              ? 'bg-emerald-50 text-emerald-800 font-bold'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span className="truncate">{r.name}</span>
                          {selectedResume === r.name && <Check className="w-3 h-3 text-emerald-600" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Documents Pill / Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setDocsDropdownOpen(!docsDropdownOpen);
                    setResumeDropdownOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer ${
                    selectedDocs.length > 0
                      ? 'border-blue-300 bg-blue-50 text-blue-800 font-semibold'
                      : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <FolderClosed className="w-3 h-3 text-blue-600" />
                  <span>
                    {selectedDocs.length > 0 ? `${selectedDocs.length} Docs Attached` : '+ Add Documents'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>

                {docsDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-30 space-y-1">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1">
                      Attach Extra Reference Docs:
                    </div>
                    {documents.length === 0 ? (
                      <div className="p-3 text-center text-xs text-gray-400">
                        No documents uploaded yet.<br />
                        <span className="text-[10px] text-gray-400">Upload in Documents tab</span>
                      </div>
                    ) : (
                      documents.map(d => (
                        <div
                          key={d.id || d.name}
                          onClick={() => toggleDocSelection(d.name)}
                          className={`px-2 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer ${
                            selectedDocs.includes(d.name)
                              ? 'bg-blue-50 text-blue-800 font-semibold'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span className="truncate">{d.name}</span>
                          {selectedDocs.includes(d.name) && <Check className="w-3 h-3 text-blue-600" />}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Custom Instructions Pill */}
              <button
                type="button"
                onClick={() => setShowInstructionsInput(!showInstructionsInput)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer ${
                  showInstructionsInput || customInstructions
                    ? 'border-purple-300 bg-purple-50 text-purple-800 font-semibold'
                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                }`}
              >
                <Plus className="w-3 h-3 text-purple-600" />
                <span>{customInstructions ? 'Instructions Attached' : '+ Instructions'}</span>
              </button>
            </div>

            {showInstructionsInput && (
              <div className="mt-2 animate-in fade-in duration-150">
                <input
                  type="text"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Focus heavily on distributed caching and concurrency..."
                  className="w-full px-3 py-1.5 bg-purple-50/50 border border-purple-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
            )}
          </div>

          {/* 6. Output Settings Row */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              AI Copilot & Model Settings
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Model Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setModelDropdownOpen(!modelDropdownOpen);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-xs text-left flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="font-semibold text-gray-900 truncate">{currentModelObj.name}</span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                </button>

                {modelDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-1 z-30 space-y-1">
                    {models.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(m.id);
                          setModelDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${
                          selectedModel === m.id
                            ? 'bg-emerald-50 text-emerald-800 font-bold'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div>{m.name}</div>
                        <div className="text-[10px] text-gray-400 font-normal">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Language Selector */}
              <div className="relative">
                <button
                  type="button"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 text-xs text-left flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center space-x-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="font-semibold text-gray-900">🌐 English</span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                </button>
              </div>
            </div>
          </div>

          {/* 7. Audio Source Row */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-800">
                🎙️ Audio Capture Routing
              </label>
              <button
                type="button"
                onClick={() => setShowAdvancedAudio(!showAdvancedAudio)}
                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center space-x-1 cursor-pointer"
              >
                <span>{showAdvancedAudio ? 'Hide Devices' : 'Select Devices'}</span>
                <SlidersHorizontal className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setAudioSource('both')}
                className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                  audioSource === 'both'
                    ? 'bg-emerald-600 text-white font-semibold border-emerald-600 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="text-xs font-semibold flex items-center justify-center space-x-1">
                  <Repeat className="w-3 h-3" />
                  <span>Both</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAudioSource('system')}
                className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                  audioSource === 'system'
                    ? 'bg-emerald-600 text-white font-semibold border-emerald-600 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="text-xs font-semibold flex items-center justify-center space-x-1">
                  <Volume2 className="w-3 h-3" />
                  <span>System</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAudioSource('mic')}
                className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                  audioSource === 'mic'
                    ? 'bg-emerald-600 text-white font-semibold border-emerald-600 shadow-xs'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="text-xs font-semibold flex items-center justify-center space-x-1">
                  <Mic className="w-3 h-3" />
                  <span>Microphone</span>
                </div>
              </button>
            </div>

            {/* Collapsible Device Dropdowns */}
            {showAdvancedAudio && (
              <div className="pt-2 border-t border-gray-200 grid grid-cols-2 gap-2 text-xs">
                {(audioSource === 'both' || audioSource === 'mic') && (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Microphone</label>
                    <select
                      value={selectedMicId ?? ''}
                      onChange={(e) => setSelectedMicId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-2 py-1 bg-white border border-gray-200 rounded-md text-xs text-gray-900"
                    >
                      <option value="">Default Microphone</option>
                      {audioDevices.inputs.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(audioSource === 'both' || audioSource === 'system') && (
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">System Loopback</label>
                    <select
                      value={selectedLoopbackId ?? ''}
                      onChange={(e) => setSelectedLoopbackId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-2 py-1 bg-white border border-gray-200 rounded-md text-xs text-gray-900"
                    >
                      <option value="">Default WASAPI Output</option>
                      {audioDevices.outputs.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 8. Behavior Checkboxes */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoAnswer}
                onChange={(e) => setAutoAnswer(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300"
              />
              <span className="font-medium">Auto Answer (Beta)</span>
              <Info className="w-3 h-3 text-gray-400" />
            </label>

            <label className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={saveTranscript}
                onChange={(e) => setSaveTranscript(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300"
              />
              <span className="font-medium">Save Transcript</span>
              <Info className="w-3 h-3 text-gray-400" />
            </label>
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="px-6 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <span>Create Session</span>
            <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
}
