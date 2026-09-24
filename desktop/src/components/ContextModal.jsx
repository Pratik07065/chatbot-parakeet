import React, { useState, useEffect } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  Briefcase, 
  CheckCircle2, 
  Layers, 
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export default function ContextModal({ isOpen, onClose, onContextUpdated }) {
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [contextStatus, setContextStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/context/status');
      if (res.ok) {
        const data = await res.json();
        setContextStatus(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setResumeFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!resumeFile && !jobDescription.trim()) {
      setStatusMessage({ type: 'error', text: 'Please select a resume file or paste a job description.' });
      return;
    }

    setIsUploading(true);
    setStatusMessage(null);

    const formData = new FormData();
    if (resumeFile) {
      formData.append('resume', resumeFile);
    }
    if (jobDescription.trim()) {
      formData.append('job_description', jobDescription.trim());
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/context/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setContextStatus(data.context);
        setStatusMessage({ type: 'success', text: 'Resume & Job Description indexed in memory!' });
        if (onContextUpdated) onContextUpdated(data.context);
      } else {
        setStatusMessage({ type: 'error', text: 'Failed to index context into memory.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Connection error: ${err.message}` });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="interactive-hud-element fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md app-no-drag pointer-events-auto">
      <div className="w-full max-w-xl bg-neutral-900/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-100">
              In-Memory Candidate Context (Resume + JD)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleUpload} className="p-5 overflow-y-auto custom-scrollbar space-y-4 text-xs">
          {/* Active Context Stats Banner */}
          {contextStatus && (
            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20">
              <div className="flex items-center space-x-2">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">Resume</span>
                  <span className="font-semibold text-slate-200">
                    {contextStatus.has_resume 
                      ? `${contextStatus.resume_filename} (${contextStatus.resume_chunks_count} chunks)` 
                      : 'None Loaded'}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">Job Description</span>
                  <span className="font-semibold text-slate-200">
                    {contextStatus.has_job_description 
                      ? `${contextStatus.jd_words} words indexed` 
                      : 'None Loaded'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Upload Resume Section */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-200 flex items-center justify-between">
              <span>Candidate Resume (PDF or TXT)</span>
              <span className="text-[10px] font-mono text-slate-500">Fast in-memory vector store</span>
            </label>

            <div className="border border-dashed border-white/20 rounded-xl p-4 flex flex-col items-center justify-center bg-black/20 hover:border-indigo-500/50 transition-colors relative cursor-pointer">
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="w-6 h-6 text-slate-400 mb-1.5" />
              <p className="text-slate-300 font-medium text-xs">
                {resumeFile ? resumeFile.name : "Click or drag & drop Resume PDF/TXT"}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {resumeFile ? `${(resumeFile.size / 1024).toFixed(1)} KB selected` : "Parsed into semantic experience chunks"}
              </p>
            </div>
          </div>

          {/* Paste Job Description */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-200 flex items-center justify-between">
              <span>Target Job Description / Requirements</span>
              <span className="text-[10px] font-mono text-slate-500">Keyword matching & alignment</span>
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste job description, required tech stack, or interviewer focus areas here..."
              rows={4}
              className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 text-xs font-sans resize-none"
            />
          </div>

          {/* Status feedback message */}
          {statusMessage && (
            <div className={`p-2.5 rounded-lg flex items-center space-x-2 text-xs ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Indexing Vectors...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Index into Copilot Memory</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
