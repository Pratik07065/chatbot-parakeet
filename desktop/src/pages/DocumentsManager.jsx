import React, { useState } from 'react';
import {
  FolderClosed,
  FileText,
  Upload,
  Eye,
  Trash2,
  CheckCircle2,
  Plus,
  X,
  Sparkles,
  BookOpen,
  Code,
  Layers,
  AlertTriangle,
  Check,
  Search,
  Copy,
  Tag,
  FileCode,
  Building,
  Bookmark
} from 'lucide-react';

export default function DocumentsManager({
  documents = [],
  onUploadDocument,
  onDeleteDocument,
  isUploading = false
}) {
  const [previewDoc, setPreviewDoc] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');
  const [copiedPreview, setCopiedPreview] = useState(false);
  const [uploadDocType, setUploadDocType] = useState('Technical Notes');
  const [showTypeSelectModal, setShowTypeSelectModal] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  const docTypes = [
    'Technical Notes',
    'System Design',
    'Job Description',
    'Company Notes',
    'Behavioral Prep',
    'Algorithm CheatSheet'
  ];

  const filteredDocuments = documents.filter(doc => {
    const matchSearch = (doc.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.type || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedTypeFilter === 'all') return matchSearch;
    return matchSearch && (doc.type || '').toLowerCase().includes(selectedTypeFilter.toLowerCase());
  });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPendingFile(file);
      setShowTypeSelectModal(true);
    }
    e.target.value = '';
  };

  const handleConfirmUpload = () => {
    if (pendingFile && onUploadDocument) {
      onUploadDocument(pendingFile, uploadDocType);
    }
    setPendingFile(null);
    setShowTypeSelectModal(false);
  };

  const confirmDelete = async (id) => {
    if (onDeleteDocument) {
      await onDeleteDocument(id);
    }
    setDeleteConfirmId(null);
  };

  const handleCopyPreviewText = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 2000);
  };

  const getDocIcon = (type = '') => {
    const t = type.toLowerCase();
    if (t.includes('system') || t.includes('design') || t.includes('architecture')) {
      return <Layers className="w-5 h-5 text-indigo-600" />;
    }
    if (t.includes('cheat') || t.includes('code') || t.includes('algo')) {
      return <Code className="w-5 h-5 text-purple-600" />;
    }
    if (t.includes('company') || t.includes('job')) {
      return <Building className="w-5 h-5 text-amber-600" />;
    }
    if (t.includes('prep') || t.includes('behavioral')) {
      return <Bookmark className="w-5 h-5 text-emerald-600" />;
    }
    return <FolderClosed className="w-5 h-5 text-blue-600" />;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Documents & Notes</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Supplemental context files, System Design cheat sheets, Job Descriptions, and Company Notes indexed for copilot recall.
          </p>
        </div>

        {/* Upload CTA with hidden input */}
        <label className="cursor-pointer px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-600/20 flex items-center justify-center space-x-2 transition-all active:scale-95 shrink-0">
          <Plus className="w-4 h-4" />
          <span>{isUploading ? 'Uploading & Indexing...' : '+ Upload Document'}</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md,.json"
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
          />
        </label>
      </div>

      {/* ── Search & Filter Tabs ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-200">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents or categories..."
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['all', 'System Design', 'Technical Notes', 'Interview Prep'].map((filterKey) => (
            <button
              key={filterKey}
              onClick={() => setSelectedTypeFilter(filterKey)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap capitalize ${
                selectedTypeFilter === filterKey
                  ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {filterKey === 'all' ? 'All Docs' : filterKey}
            </button>
          ))}
          <span className="text-xs font-medium text-gray-400 ml-2 hidden sm:inline">
            <strong>{filteredDocuments.length}</strong> Files
          </span>
        </div>
      </div>

      {/* ── Documents Grid ── */}
      {filteredDocuments.length === 0 ? (
        /* Empty State */
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <FolderClosed className="w-7 h-7" />
          </div>
          <div className="max-w-sm">
            <h3 className="text-sm font-bold text-gray-900">No documents uploaded yet</h3>
            <p className="text-xs text-gray-500 mt-1">
              Upload system design cheat-sheets, job specifications, company architecture notes, or behavioral STAR stories to give Parakeet AI richer context.
            </p>
          </div>
          <label className="cursor-pointer px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-2 transition-all">
            <Upload className="w-4 h-4" />
            <span>Upload Document</span>
            <input type="file" accept=".pdf,.docx,.txt,.md,.json" className="hidden" onChange={handleFileChange} />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="bg-white border border-gray-200 hover:border-emerald-300 rounded-2xl p-5 shadow-xs space-y-3.5 flex flex-col justify-between transition-all group relative"
            >
              <div className="space-y-3">
                {/* Header: File icon, Name, Status Badge */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-50 transition-colors">
                      {getDocIcon(doc.type)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-gray-900 truncate group-hover:text-emerald-800 transition-colors">
                        {doc.name}
                      </h3>
                      <div className="flex items-center space-x-2 text-[11px] text-gray-400 mt-0.5">
                        <span>{doc.size || '50 KB'}</span>
                        <span>•</span>
                        <span>{doc.updatedAt || 'Indexed in Memory'}</span>
                      </div>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold shrink-0 flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Active</span>
                  </span>
                </div>

                {/* Type Badge & Chunks count */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-200/50">
                    {doc.type || 'Technical Notes'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium">
                    {doc.chunks_count || (doc.chunks ? doc.chunks.length : 4)} sections
                  </span>
                  {doc.words && (
                    <span className="text-gray-400">
                      ({doc.words} words)
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons: Preview & Remove */}
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPreviewDoc(doc)}
                  className="px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-emerald-50 text-gray-700 hover:text-emerald-800 border border-gray-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-gray-500" />
                  <span>👁️ Preview</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(doc.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                  title="Remove this document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Document Type Selector Modal (On File Select) ── */}
      {showTypeSelectModal && pendingFile && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <FolderClosed className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Document Category</h3>
                  <p className="text-[11px] text-gray-400 truncate max-w-[200px]">{pendingFile.name}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPendingFile(null);
                  setShowTypeSelectModal(false);
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 block">Select category for indexing:</label>
              <div className="grid grid-cols-2 gap-1.5">
                {docTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setUploadDocType(t)}
                    className={`p-2 rounded-xl text-left text-xs font-medium border transition-all ${
                      uploadDocType === t
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold shadow-xs'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setPendingFile(null);
                  setShowTypeSelectModal(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUpload}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Upload & Index
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Modal ── */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">
                  {getDocIcon(previewDoc.type)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{previewDoc.name}</h3>
                  <p className="text-[11px] text-gray-400">
                    {previewDoc.type || 'Document'} • {previewDoc.size || '45 KB'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs text-gray-800 font-sans">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Document Content & Vector Memory Chunks
                </span>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2.5 text-xs font-mono text-gray-700 leading-relaxed max-h-80 overflow-y-auto">
                  {previewDoc.raw_text ? (
                    <p className="whitespace-pre-wrap">{previewDoc.raw_text}</p>
                  ) : (
                    <>
                      <p className="bg-white p-2.5 rounded-lg border border-gray-200">
                        <strong>[System Design Topic 1 - High Availability]:</strong> Implement multi-region active-active replicas with Paxos/Raft consensus for partition tolerance.
                      </p>
                      <p className="bg-white p-2.5 rounded-lg border border-gray-200">
                        <strong>[System Design Topic 2 - Caching Hierarchy]:</strong> Redis cluster with Write-Through caching pattern and probabilistic early expiration to avoid cache stampede.
                      </p>
                      <p className="bg-white p-2.5 rounded-lg border border-gray-200">
                        <strong>[System Design Topic 3 - Message Queue]:</strong> Kafka partitioning strategy with consumer group scaling for at-least-once message delivery semantics.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              <button
                onClick={() => handleCopyPreviewText(previewDoc.raw_text || previewDoc.name)}
                className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-100 flex items-center space-x-1.5 cursor-pointer"
              >
                {copiedPreview ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                <span>{copiedPreview ? 'Copied' : 'Copy Text'}</span>
              </button>

              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-1.5 rounded-lg bg-gray-900 hover:bg-black text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Remove Document?</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Remove this document? It will be deleted from session memory and in-memory vector storage.
              </p>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDelete(deleteConfirmId)}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                🗑️ Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
