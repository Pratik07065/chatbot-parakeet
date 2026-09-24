import React, { useState } from 'react';
import {
  Plus,
  Search,
  ArrowUpDown,
  LayoutGrid,
  List,
  Play,
  Activity,
  Calendar,
  Clock,
  ChevronRight,
  Sparkles,
  Repeat,
  FileText,
  Volume2,
  Mic,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Bot,
  FolderClosed,
  X,
  Layers,
  Paperclip,
  Check
} from 'lucide-react';

export default function CallSessions({
  sessions = [],
  resumes = [],
  documents = [],
  onOpenCreateModal,
  onLaunchSession,
  onViewSummary,
  onDeleteSession,
  onDeleteResume,
  onDeleteDocument
}) {
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'active' | 'ended'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' | 'oldest'
  const [showDrawer, setShowDrawer] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null); // { id, name, type: 'resume' | 'document' }

  // Filter sessions by tab & search query
  const filteredSessions = sessions.filter((ses) => {
    if (activeTab === 'active' && ses.status !== 'Live' && ses.status !== 'Ready') return false;
    if (activeTab === 'ended' && ses.status !== 'Completed') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCompany = (ses.company || '').toLowerCase().includes(q);
      const matchRole = (ses.role || '').toLowerCase().includes(q);
      const matchProvider = (ses.provider || '').toLowerCase().includes(q);
      const matchResume = (ses.resume || '').toLowerCase().includes(q);
      return matchCompany || matchRole || matchProvider || matchResume;
    }

    return true;
  });

  const activeCount = sessions.filter(s => s.status === 'Live' || s.status === 'Ready').length;
  const endedCount = sessions.filter(s => s.status === 'Completed').length;
  const totalFilesCount = (resumes?.length || 0) + (documents?.length || 0);

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    if (deleteConfirmTarget.type === 'resume' && onDeleteResume) {
      await onDeleteResume(deleteConfirmTarget.id);
    } else if (deleteConfirmTarget.type === 'document' && onDeleteDocument) {
      await onDeleteDocument(deleteConfirmTarget.id);
    }
    setDeleteConfirmTarget(null);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 relative">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Call Sessions</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage and review your active and past interview copilot sessions.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Quick Files Manager Badge */}
          <button
            type="button"
            onClick={() => setShowDrawer(true)}
            className="px-3 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer group"
            title="Manage attached resumes and documents"
          >
            <Paperclip className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
            <span>
              <strong>{resumes.length}</strong> {resumes.length === 1 ? 'Resume' : 'Resumes'}
              {documents.length > 0 && <>, <strong>{documents.length}</strong> Docs</>}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60 ml-0.5">
              Manage
            </span>
          </button>

          {/* Create Session CTA */}
          <button
            onClick={onOpenCreateModal}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2 shrink-0 transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Session</span>
          </button>
        </div>
      </div>

      {/* ── Tabs & Filter Controls Bar ── */}
      <div className="border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
          {/* Tabs */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <span>All</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'all' ? 'bg-emerald-200/70 text-emerald-900' : 'bg-gray-200 text-gray-600'
              }`}>
                {sessions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <span>Active</span>
              {activeCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              )}
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'active' ? 'bg-emerald-200/70 text-emerald-900' : 'bg-gray-200 text-gray-600'
              }`}>
                {activeCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('ended')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'ended'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <span>Ended</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'ended' ? 'bg-emerald-200/70 text-emerald-900' : 'bg-gray-200 text-gray-600'
              }`}>
                {endedCount}
              </span>
            </button>
          </div>

          {/* Search, Sort, & View Toggle */}
          <div className="flex items-center space-x-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or description..."
                className="w-56 pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Sort Toggle */}
            <button
              onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer"
              title={`Sort by: ${sortOrder}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
              <span className="hidden md:inline capitalize">{sortOrder}</span>
            </button>

            {/* Grid vs List View Switcher */}
            <div className="p-0.5 bg-gray-100 rounded-lg border border-gray-200 flex items-center">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-400 hover:text-gray-700'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'list' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-400 hover:text-gray-700'
                }`}
                title="List view"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sessions Content ── */}
      {filteredSessions.length === 0 ? (
        /* Empty State */
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Activity className="w-7 h-7" />
          </div>
          <div className="max-w-sm">
            <h3 className="text-sm font-bold text-gray-900">No call sessions yet</h3>
            <p className="text-xs text-gray-500 mt-1">
              Create a session to start getting real-time AI assistance, live audio transcriptions, and instant technical answers during interviews.
            </p>
          </div>
          <button
            onClick={onOpenCreateModal}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm shadow-emerald-600/20 transition-all flex items-center space-x-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Session</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSessions.map((ses) => (
            <div
              key={ses.id}
              className="bg-white border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all rounded-2xl p-5 flex flex-col justify-between group relative"
            >
              <div className="space-y-3">
                {/* Header Row: Company Icon & Status Badge */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                      {ses.company ? ses.company[0].toUpperCase() : 'P'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                        {ses.company || 'Technical Interview'}
                      </h3>
                      <p className="text-[11px] text-gray-500 truncate">{ses.role || 'Software Engineer'}</p>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      ses.status === 'Live'
                        ? 'bg-emerald-100 text-emerald-800 animate-pulse'
                        : ses.status === 'Ready'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {ses.status === 'Live' ? '● Live' : ses.status}
                  </span>
                </div>

                {/* Info Metadata Badges */}
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {/* Model Tag */}
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/60 font-medium flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span className="truncate max-w-[110px]">{ses.provider || 'Groq Llama 3.3'}</span>
                  </span>

                  {/* Audio Routing Tag */}
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 font-medium flex items-center space-x-1">
                    <Repeat className="w-3 h-3 text-emerald-600" />
                    <span>{ses.audioSource || 'Both Audio'}</span>
                  </span>

                  {/* Resume Tag */}
                  {ses.resume && (
                    <span className="px-2 py-0.5 rounded-md bg-gray-50 text-gray-700 border border-gray-200 font-medium flex items-center space-x-1">
                      <FileText className="w-3 h-3 text-gray-500" />
                      <span className="truncate max-w-[100px]">{ses.resume}</span>
                    </span>
                  )}
                </div>

                {/* Date & Duration */}
                <div className="flex items-center space-x-3 text-[11px] text-gray-400 pt-1">
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>{ses.date || 'Recent'}</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{ses.duration || '30m'}</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 mt-3 border-t border-gray-100 flex items-center justify-between">
                <button
                  onClick={() => onLaunchSession(ses)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white font-semibold text-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch HUD</span>
                </button>

                {onViewSummary && (
                  <button
                    onClick={() => onViewSummary(ses)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                    title="View Session Summary & Notes"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden divide-y divide-gray-100">
          {filteredSessions.map((ses) => (
            <div
              key={ses.id}
              className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-4 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                  {ses.company ? ses.company[0].toUpperCase() : 'P'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-gray-900 truncate">{ses.company || 'Technical Interview'}</span>
                    <span className="text-xs text-gray-400">• {ses.role || 'Software Engineer'}</span>
                    <span
                      className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                        ses.status === 'Live'
                          ? 'bg-emerald-100 text-emerald-800'
                          : ses.status === 'Ready'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {ses.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-[11px] text-gray-500 mt-1">
                    <span>{ses.date}</span>
                    <span>•</span>
                    <span>{ses.duration}</span>
                    <span>•</span>
                    <span className="text-amber-700 font-medium">{ses.provider}</span>
                    <span>•</span>
                    <span className="text-emerald-700 font-medium">{ses.audioSource || 'Both Audio'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0 ml-4">
                <button
                  onClick={() => onLaunchSession(ses)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white font-semibold text-xs transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch HUD</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Quick-Access Uploaded Files Manager Slide-Over Drawer ── */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md h-full shadow-2xl border-l border-gray-200 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/50">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <Paperclip className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Session Knowledge Files</h3>
                  <p className="text-[11px] text-gray-400">
                    {totalFilesCount} active {totalFilesCount === 1 ? 'file' : 'files'} used to ground AI responses
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowDrawer(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              {/* Resumes Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 flex items-center space-x-1.5">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span>Resumes & CVs ({resumes.length})</span>
                  </span>
                </div>

                {resumes.length === 0 ? (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center text-gray-400">
                    No resumes attached.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {resumes.map((r) => (
                      <div
                        key={r.id}
                        className="p-3 bg-white border border-gray-200 rounded-xl shadow-xs flex items-center justify-between group hover:border-emerald-300 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-gray-900 truncate text-[11px]">{r.name}</h4>
                            <p className="text-[10px] text-gray-400">{r.size} • {r.chunks_count || 8} sections</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setDeleteConfirmTarget({ id: r.id, name: r.name, type: 'resume' })}
                          className="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 text-[11px] font-semibold flex items-center space-x-1 transition-colors shrink-0 cursor-pointer"
                          title="Remove from session memory"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Supplemental Documents Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 flex items-center space-x-1.5">
                    <FolderClosed className="w-4 h-4 text-blue-600" />
                    <span>Documents & Cheat Sheets ({documents.length})</span>
                  </span>
                </div>

                {documents.length === 0 ? (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center text-gray-400">
                    No supplemental documents attached.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((d) => (
                      <div
                        key={d.id}
                        className="p-3 bg-white border border-gray-200 rounded-xl shadow-xs flex items-center justify-between group hover:border-blue-300 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                            <FolderClosed className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-gray-900 truncate text-[11px]">{d.name}</h4>
                            <p className="text-[10px] text-gray-400">{d.type || 'Notes'} • {d.size}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setDeleteConfirmTarget({ id: d.id, name: d.name, type: 'document' })}
                          className="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 text-[11px] font-semibold flex items-center space-x-1 transition-colors shrink-0 cursor-pointer"
                          title="Remove from session memory"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-gray-400">
                Vector memory auto-syncs on removal
              </span>
              <button
                type="button"
                onClick={() => setShowDrawer(false)}
                className="px-4 py-1.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Drawer Deletion Confirmation Modal ── */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Remove "{deleteConfirmTarget.name}"?
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                This will immediately purge its vector embeddings from session memory so it will not ground future answers.
              </p>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                ✕ Remove File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
