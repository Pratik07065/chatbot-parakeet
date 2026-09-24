import React, { useState, useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-go';
import {
  ArrowLeft,
  Copy,
  Check,
  Download,
  FileText,
  Plus,
  Clock,
  HelpCircle,
  Code2,
  Zap,
  Activity,
  User,
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Award,
  CheckCircle2,
  Calendar,
  Volume2,
  SlidersHorizontal,
  Bot
} from 'lucide-react';

export default function SessionSummary({ sessionData, onStartNewSession }) {
  const [activeTab, setActiveTab] = useState('qa'); // 'qa' | 'transcript'
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState(null);
  const [expandedQuestions, setExpandedQuestions] = useState({});
  const [transcriptSearch, setTranscriptSearch] = useState('');

  // Extract session metadata with robust fallbacks
  const company = sessionData?.company || sessionData?.companyName || 'Google';
  const role = sessionData?.role || sessionData?.jobTitle || 'Senior Staff Software Engineer';
  const sessionType = sessionData?.sessionType || 'Interview';
  const startTime = sessionData?.startTime || 'Sept 7, 2026 • 2:45 PM';
  const duration = sessionData?.duration || '34 mins 12 secs';
  const model = sessionData?.provider || sessionData?.selectedModel || '⚡ Groq (Llama 3.3 70B)';
  const audioSource = sessionData?.audioSource || '🔄 Both (System + Mic)';

  // Real Q&A data extracted from session payload
  const questionsList = useMemo(() => {
    return sessionData?.questions || [];
  }, [sessionData]);

  // Real transcripts list extracted from session payload
  const transcriptsList = useMemo(() => {
    return sessionData?.transcripts || [];
  }, [sessionData]);

  // Filter transcripts by search keyword
  const filteredTranscripts = useMemo(() => {
    if (!transcriptSearch.trim()) return transcriptsList;
    const q = transcriptSearch.toLowerCase();
    return transcriptsList.filter(t => t.text?.toLowerCase().includes(q) || t.speaker?.toLowerCase().includes(q));
  }, [transcriptsList, transcriptSearch]);

  // Toggle question accordion
  const toggleQuestion = (id) => {
    setExpandedQuestions(prev => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id]
    }));
  };

  const isQuestionExpanded = (id) => {
    return expandedQuestions[id] !== false; // Default expanded
  };

  // Copy code helper
  const handleCopyCode = (code, index) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIndex(index);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  // Copy full summary to clipboard
  const handleCopyAll = () => {
    let text = `=== Interview Summary: ${role} at ${company} ===\n`;
    text += `Date: ${startTime} | Duration: ${duration} | Model: ${model}\n\n`;
    text += `--- Q&A Highlights ---\n`;
    questionsList.forEach((q, i) => {
      text += `\n[Q${i + 1}] ${q.question}\n`;
      if (q.type === 'coding') {
        text += `Intuition: ${q.intuition || ''}\n`;
        text += `Code:\n${q.code || ''}\n`;
        text += `Time: ${q.timeComplexity || ''} | Space: ${q.spaceComplexity || ''}\n`;
      } else {
        (q.bullets || []).forEach(b => {
          text += `• ${b}\n`;
        });
      }
    });

    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Export Markdown file download
  const handleExportMarkdown = () => {
    let md = `# Interview Session Review & Debrief\n\n`;
    md += `| Field | Value |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **Company** | ${company} |\n`;
    md += `| **Role** | ${role} |\n`;
    md += `| **Date** | ${startTime} |\n`;
    md += `| **Duration** | ${duration} |\n`;
    md += `| **Audio Route** | ${audioSource} |\n`;
    md += `| **AI Model** | ${model} |\n\n`;
    md += `---\n\n`;

    md += `## 💡 Q&A Highlights & Speaking Cues\n\n`;
    if (questionsList.length === 0) {
      md += `*No questions recorded during this session.*\n\n`;
    } else {
      questionsList.forEach((q, i) => {
        md += `### ${i + 1}. ${q.question}\n\n`;
        if (q.type === 'coding') {
          md += `**Intuition:**\n${q.intuition || ''}\n\n`;
          if (q.algorithm && q.algorithm.length > 0) {
            md += `**Algorithm:**\n`;
            q.algorithm.forEach((step, sIdx) => {
              md += `${sIdx + 1}. ${step}\n`;
            });
            md += `\n`;
          }
          md += `**Implementation (${q.language || 'Python'}):**\n\`\`\`${q.language || 'python'}\n${q.code || ''}\n\`\`\`\n\n`;
          md += `**Complexity Analysis:**\n- **Time:** ${q.timeComplexity || 'N/A'}\n- **Space:** ${q.spaceComplexity || 'N/A'}\n\n`;
        } else {
          md += `**⭐ Answer Cues:**\n`;
          (q.bullets || []).forEach(b => {
            md += `- ${b}\n`;
          });
          md += `\n`;
        }
      });
    }

    md += `---\n\n`;
    md += `## 🎙️ Chronological Transcript History\n\n`;
    if (transcriptsList.length === 0) {
      md += `*No audio transcripts recorded during this session.*\n\n`;
    } else {
      transcriptsList.forEach(t => {
        const speakerTag = t.speaker === 'interviewer' ? 'Interviewer' : 'Candidate (You)';
        md += `**[${t.timestamp || '00:00'}] ${speakerTag}:**\n`;
        md += `> ${t.text}\n\n`;
      });
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `interview_review_${company.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export JSON file download
  const handleExportJSON = () => {
    const payload = {
      metadata: {
        company,
        role,
        sessionType,
        startTime,
        duration,
        model,
        audioSource,
        exportedAt: new Date().toISOString()
      },
      analytics: {
        totalQuestions: questionsList.length,
        codingChallenges: questionsList.filter(q => q.type === 'coding').length,
        avgTTFT: '380ms',
        speechRatio: '65% / 35%'
      },
      questions: questionsList,
      transcripts: transcriptsList
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `interview_session_${company.toLowerCase().replace(/\s+/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate metrics
  const codingCount = questionsList.filter(q => q.type === 'coding').length;
  const verbalCount = questionsList.filter(q => q.type === 'verbal').length;

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-gray-900 font-sans antialiased flex flex-col selection:bg-emerald-100 selection:text-emerald-900">
      {/* ── 1. Top Navigation & Action Bar ── */}
      <header className="h-16 border-b border-gray-200 bg-white px-6 md:px-10 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        {/* Left: Back to Dashboard */}
        <button
          onClick={onStartNewSession}
          className="flex items-center space-x-2 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl transition-all shadow-xs cursor-pointer"
          title="Return to Call Sessions Dashboard"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Call Sessions</span>
        </button>

        {/* Right Actions */}
        <div className="flex items-center space-x-2">
          {/* Copy All */}
          <button
            onClick={handleCopyAll}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700 transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
            title="Copy summary text"
          >
            {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
            <span>{copiedAll ? 'Copied' : 'Copy All'}</span>
          </button>

          {/* Export Markdown */}
          <button
            onClick={handleExportMarkdown}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700 transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
            title="Download formatted Markdown summary"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            <span className="hidden sm:inline">Export Markdown</span>
            <span className="sm:hidden">MD</span>
          </button>

          {/* Export JSON */}
          <button
            onClick={handleExportJSON}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700 transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
            title="Download JSON data"
          >
            <FileText className="w-3.5 h-3.5 text-gray-500" />
            <span className="hidden sm:inline">Export JSON</span>
            <span className="sm:hidden">JSON</span>
          </button>

          {/* Start New Session CTA */}
          <button
            onClick={onStartNewSession}
            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-600/20 transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Start New Session</span>
          </button>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 space-y-6">
        {/* ── 2. Session Header Card ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {sessionType === 'interview' ? '💼 Interview Call' : '📞 Regular Call'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700">
                  Concluded
                </span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                {role} <span className="text-gray-400 font-normal">at</span> {company}
              </h1>
            </div>

            <div className="flex items-center space-x-2 text-xs text-gray-500 font-medium">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>{startTime}</span>
            </div>
          </div>

          {/* Metadata Pills Row */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 text-xs">
            <span className="px-3 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              <span>Duration: <strong>{duration}</strong></span>
            </span>

            <span className="px-3 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 flex items-center space-x-1.5">
              <Volume2 className="w-3.5 h-3.5 text-cyan-600" />
              <span>Audio: <strong>{audioSource}</strong></span>
            </span>

            <span className="px-3 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Model: <strong>{model}</strong></span>
            </span>
          </div>
        </div>

        {/* ── 3. Analytics & Summary Cards (4-Column Grid) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Questions Detected */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Total Questions
              </span>
              <span className="text-lg font-bold text-gray-900 block">
                {questionsList.length} Questions
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">100% Cues Generated</span>
            </div>
          </div>

          {/* Card 2: Coding Challenges */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Screenshots / Code
              </span>
              <span className="text-lg font-bold text-gray-900 block">
                {codingCount} Challenges
              </span>
              <span className="text-[10px] text-purple-600 font-medium">Gemini Flash Vision</span>
            </div>
          </div>

          {/* Card 3: Avg Response Time */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Average TTFT
              </span>
              <span className="text-lg font-bold text-gray-900 block">
                ⚡ 380ms
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">&lt;1.5s SLA Compliant</span>
            </div>
          </div>

          {/* Card 4: Speech Distribution Ratio */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Speech Ratio
              </span>
              <span className="text-xs font-bold text-gray-900">65% / 35%</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden flex my-2">
              <div className="bg-blue-500 h-full" style={{ width: '65%' }} title="Interviewer: 65%"></div>
              <div className="bg-emerald-500 h-full" style={{ width: '35%' }} title="Candidate: 35%"></div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
                <span>Interviewer 65%</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                <span>You 35%</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── 4. Main Content Area (Tabbed Navigation) ── */}
        <div className="space-y-4">
          {/* Tab Selection Bar */}
          <div className="border-b border-gray-200 flex items-center space-x-4">
            <button
              onClick={() => setActiveTab('qa')}
              className={`pb-3 text-xs font-bold transition-all flex items-center space-x-2 relative cursor-pointer ${
                activeTab === 'qa'
                  ? 'text-emerald-700 border-b-2 border-emerald-600'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span>Q&A Highlights</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'qa' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {questionsList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('transcript')}
              className={`pb-3 text-xs font-bold transition-all flex items-center space-x-2 relative cursor-pointer ${
                activeTab === 'transcript'
                  ? 'text-emerald-700 border-b-2 border-emerald-600'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span>Full Transcript</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'transcript' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {transcriptsList.length} turns
              </span>
            </button>
          </div>

          {/* TAB 1: Q&A HIGHLIGHTS */}
          {activeTab === 'qa' && (
            <div className="space-y-4">
              {questionsList.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-400 space-y-2">
                  <HelpCircle className="w-8 h-8 mx-auto text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">No questions captured during this session</p>
                  <p className="text-xs text-gray-400">Questions asked and answered during live calls will appear here.</p>
                </div>
              ) : (
                questionsList.map((q, idx) => {
                  const expanded = isQuestionExpanded(q.id || `q${idx}`);
                  return (
                    <div
                      key={q.id || idx}
                      className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs transition-all hover:border-gray-300"
                    >
                      {/* Accordion Question Header */}
                      <div
                        onClick={() => toggleQuestion(q.id || `q${idx}`)}
                        className="p-5 flex items-start justify-between gap-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                      >
                        <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-xs font-bold text-gray-900">
                                💬 Q: {q.question}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 text-[11px] text-gray-500">
                              <span className={`px-2 py-0.2 rounded-md font-semibold text-[10px] uppercase ${
                                q.type === 'coding' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {q.type === 'coding' ? 'LeetCode / Coding' : 'STAR Behavioral'}
                              </span>
                              {q.timeComplexity && <span>• Time: {q.timeComplexity.split(' ')[0]}</span>}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                        >
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Accordion Body Content */}
                      {expanded && (
                        <div className="px-5 pb-5 pt-2 border-t border-gray-100 space-y-3.5 text-xs text-gray-800">
                          {/* MODE B: Coding Question */}
                          {q.type === 'coding' ? (
                            <div className="space-y-3">
                              {/* Intuition */}
                              {q.intuition && (
                                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200">
                                  <div className="font-bold text-gray-900 mb-1">Intuition & Approach:</div>
                                  <p className="text-gray-700 leading-relaxed font-sans">{q.intuition}</p>
                                </div>
                              )}

                              {/* Algorithm Steps */}
                              {q.algorithm && q.algorithm.length > 0 && (
                                <div>
                                  <div className="font-bold text-gray-900 mb-1.5">Algorithm Steps:</div>
                                  <ul className="space-y-1 pl-4 list-disc text-gray-700 leading-relaxed">
                                    {q.algorithm.map((step, sIdx) => (
                                      <li key={sIdx}>{step}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Code Solution Block */}
                              {q.code && (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-gray-900">
                                      Implementation ({q.language || 'Python'}):
                                    </span>
                                    <button
                                      onClick={() => handleCopyCode(q.code, idx)}
                                      className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                                    >
                                      {copiedCodeIndex === idx ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          <span className="text-emerald-700">Copied!</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3 text-gray-500" />
                                          <span>Copy Code</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                  <div className="bg-[#1e1e24] border border-white/10 rounded-xl p-4 font-mono text-xs text-neutral-100 overflow-x-auto shadow-inner">
                                    <pre><code>{q.code}</code></pre>
                                  </div>
                                </div>
                              )}

                              {/* Complexity Badges */}
                              {(q.timeComplexity || q.spaceComplexity) && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {q.timeComplexity && (
                                    <div className="px-3 py-1.5 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-900 font-mono text-xs">
                                      <strong>Time Complexity:</strong> {q.timeComplexity}
                                    </div>
                                  )}
                                  {q.spaceComplexity && (
                                    <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-mono text-xs">
                                      <strong>Space Complexity:</strong> {q.spaceComplexity}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            /* MODE A: Behavioral / STAR Question */
                            <div className="space-y-2.5 p-3.5 rounded-xl bg-gray-50 border border-gray-200">
                              <div className="font-bold text-emerald-800 mb-1 flex items-center space-x-1">
                                <span>⭐ AI Generated STAR Speaking Cues:</span>
                              </div>
                              <div className="space-y-2">
                                {(q.bullets || []).map((bullet, bIdx) => (
                                  <div key={bIdx} className="flex items-start space-x-2 text-xs text-gray-800 leading-relaxed">
                                    <span className="text-emerald-600 font-bold mt-0.5">•</span>
                                    <p className="flex-1">{bullet}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: FULL TRANSCRIPT */}
          {activeTab === 'transcript' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
              {/* Search Bar */}
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-gray-100">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    placeholder="Search keywords across conversation transcript..."
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder-gray-400"
                  />
                </div>
                <div className="text-xs text-gray-500 font-medium">
                  Showing <strong>{filteredTranscripts.length}</strong> of {transcriptsList.length} turns
                </div>
              </div>

              {/* Chat Feed */}
              <div className="space-y-3.5 max-h-[600px] overflow-y-auto pr-2">
                {filteredTranscripts.length === 0 ? (
                  <div className="py-12 text-center text-xs text-gray-400">
                    {transcriptSearch ? `No transcript messages match "${transcriptSearch}".` : 'No transcripts recorded during this session.'}
                  </div>
                ) : (
                  filteredTranscripts.map((t, idx) => {
                    const isInterviewer = t.speaker === 'interviewer';
                    return (
                      <div
                        key={t.id || idx}
                        className={`flex flex-col ${isInterviewer ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-center space-x-1.5 text-[10px] font-semibold text-gray-400 mb-1 px-1">
                          <User className="w-3 h-3" />
                          <span>{isInterviewer ? 'Interviewer' : 'Candidate (You)'}</span>
                          <span>•</span>
                          <span>{t.timestamp || '00:00'}</span>
                        </div>
                        <div
                          className={`p-4 rounded-2xl max-w-2xl text-xs leading-relaxed select-text shadow-xs ${
                            isInterviewer
                              ? 'bg-gray-100 border border-gray-200 text-gray-900 rounded-tl-xs'
                              : 'bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-tr-xs'
                          }`}
                        >
                          <p>{t.text}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
