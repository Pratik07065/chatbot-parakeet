import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Sparkles,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  X,
  Send,
  Code2,
  FileCode,
  BookOpen,
  FlaskConical,
  RefreshCw,
  Camera,
  ExternalLink,
  MessageSquare
} from 'lucide-react';

/**
 * Helper to safely format inline markdown bold (**text**) and code (`code`)
 */
function renderFormattedInlineText(text = '') {
  if (!text) return null;
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      const codeContent = part.slice(1, -1);
      return (
        <code
          key={index}
          className="bg-white/10 text-emerald-300 px-1 py-0.5 rounded text-[13px] font-mono border border-white/5 mx-0.5"
        >
          {codeContent}
        </code>
      );
    } else if (part.startsWith('**') && part.endsWith('**')) {
      const boldContent = part.slice(2, -2);
      return (
        <strong key={index} className="text-white font-semibold">
          {boldContent}
        </strong>
      );
    }
    return part;
  });
}

/**
 * Tier 3: Paginated Single Q&A Card
 * Exactly replicates the Parakeet AI reference single-question card layout.
 */
export default function AnswerPanel({
  currentQuestion = '',
  streamingAnswer = '',
  isGenerating = false,
  isAnalyzingScreen = false,
  activeProvider = 'groq',
  telemetry = null,
  // Pagination & History Props
  currentIndex = 0,
  totalQuestions = 1,
  hasPrev = false,
  hasNext = false,
  onPrevQuestion,
  onNextQuestion,
  onClearCard,
  // Follow-up & Quick actions
  onFollowup,
  onRegenerate,
  onForceGenerate,
  hasActiveCode = false,
  activeCodeTitle = '',
  isChatOpen = false,
  onToggleChat,
  onClose,
  onStartResize,
  panelHeight = null,
}) {
  const [copiedQuestion, setCopiedQuestion] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [feedback, setFeedback] = useState(null); // 'up' | 'down' | null
  const [followupInput, setFollowupInput] = useState('');
  const scrollContainerRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll as tokens stream in
  useEffect(() => {
    if ((isGenerating || isAnalyzingScreen) && messagesEndRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [streamingAnswer, isGenerating, isAnalyzingScreen]);

  // Copy question to clipboard
  const handleCopyQuestion = () => {
    const q = parsedContent?.question || currentQuestion;
    if (!q) return;
    navigator.clipboard.writeText(q);
    setCopiedQuestion(true);
    setTimeout(() => setCopiedQuestion(false), 2000);
  };

  // Copy code block to clipboard
  const handleCopyCode = (codeText) => {
    if (!codeText) return;
    navigator.clipboard.writeText(codeText);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Submit follow-up
  const handleSendFollowup = (query) => {
    const q = query || followupInput;
    if (!q || !q.trim()) return;
    if (onFollowup) {
      onFollowup(q.trim());
    } else if (onForceGenerate) {
      onForceGenerate(q.trim());
    }
    setFollowupInput('');
  };

  // Parse structured answer sections (Verbal / Coding / Pseudocode)
  const parsedContent = useMemo(() => {
    if (!streamingAnswer) return null;

    const raw = streamingAnswer.trim();
    const hasCodeBlock = raw.includes('```');
    const isPseudocode =
      raw.toLowerCase().includes('⭐ pseudocode:') ||
      raw.toLowerCase().includes('pseudocode:');
    const isTechnicalOrScreen =
      hasCodeBlock ||
      raw.toLowerCase().includes('intuition:') ||
      raw.toLowerCase().includes('algorithm:') ||
      raw.toLowerCase().includes('complexity') ||
      raw.toLowerCase().includes('implementation') ||
      raw.toLowerCase().includes('leetcode');

    // Extract Question
    let extractedQuestion = currentQuestion;
    const questionMatch = raw.match(/💬\s*(?:Summarized\s*)?question:\s*([^\n]+)/i);
    if (questionMatch) {
      extractedQuestion = questionMatch[1].trim();
    }

    if (isPseudocode) {
      const modeC = {
        type: 'pseudocode',
        question: extractedQuestion || 'Pseudocode Specification',
        pseudocode: '',
      };
      const codeBlockMatch = raw.match(/```(\w+)?\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        modeC.pseudocode = codeBlockMatch[2]?.trim() || '';
      } else {
        const parts = raw.split(/⭐\s*Pseudocode:/i);
        modeC.pseudocode = parts[1]?.trim() || raw;
      }
      return modeC;
    } else if (isTechnicalOrScreen) {
      const modeB = {
        type: 'coding',
        question: extractedQuestion || 'Technical Problem & Code Solution',
        intuition: '',
        algorithm: [],
        code: '',
        language: 'python',
        timeComplexity: '',
        spaceComplexity: '',
        bullets: [],
        tradeOff: '',
      };

      const codeBlockMatch = raw.match(/```(\w+)?\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        modeB.language = codeBlockMatch[1] || 'python';
        modeB.code = codeBlockMatch[2]?.trim() || '';
      }

      const lines = raw.split('\n');
      let currentSection = '';
      let insideCodeFence = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lower = line.toLowerCase();

        if (line.startsWith('```')) {
          insideCodeFence = !insideCodeFence;
          continue;
        }
        if (insideCodeFence) continue;

        if (lower.startsWith('💬') || lower.startsWith('summarized question:')) continue;
        if (lower.startsWith('⭐') || lower === 'answer:' || lower === '**answer:**') continue;

        if (lower.startsWith('**intuition:**') || lower.startsWith('intuition:')) {
          currentSection = 'intuition';
          const content = line.replace(/^\*\*intuition:\*\*|^intuition:/i, '').trim();
          if (content) modeB.intuition += (modeB.intuition ? ' ' : '') + content;
        } else if (lower.startsWith('**algorithm:**') || lower.startsWith('algorithm:') || lower.startsWith('**steps:**')) {
          currentSection = 'algorithm';
        } else if (lower.startsWith('**implementation') || lower.startsWith('implementation')) {
          currentSection = 'code';
          const langMatch = line.match(/\((.*?)\)/);
          if (langMatch) modeB.language = langMatch[1].toLowerCase();
        } else if (lower.startsWith('**complexity') || lower.startsWith('complexity analysis')) {
          currentSection = 'complexity';
        } else if (lower.startsWith('trade-off:') || lower.startsWith('tradeoff:')) {
          modeB.tradeOff = line.replace(/^trade-off:\s*|^tradeoff:\s*/i, '').trim();
        } else if (lower.includes('time complexity:') || lower.startsWith('- time:') || lower.startsWith('* time:')) {
          modeB.timeComplexity = line.replace(/^[\-\*]\s*|^\*\*time complexity:\*\*\s*|^time complexity:\s*/i, '').trim();
        } else if (lower.includes('space complexity:') || lower.startsWith('- space:') || lower.startsWith('* space:')) {
          modeB.spaceComplexity = line.replace(/^[\-\*]\s*|^\*\*space complexity:\*\*\s*|^space complexity:\s*/i, '').trim();
        } else if (currentSection === 'intuition') {
          if (line) modeB.intuition += (modeB.intuition ? ' ' : '') + line;
        } else if (currentSection === 'algorithm') {
          if (line.match(/^\d+\.|\*|\-/)) {
            modeB.algorithm.push(line.replace(/^\d+\.\s*|^[\*\-]\s*/, ''));
          } else if (line.length > 0) {
            modeB.algorithm.push(line);
          }
        } else if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
          const bullet = line.replace(/^[•\-\*]\s*/, '').trim();
          if (bullet) modeB.bullets.push(bullet);
        }
      }

      return modeB;
    } else {
      // ── Verbal STAR / Concept Mode ──
      const modeA = {
        type: 'verbal',
        question: extractedQuestion || 'Interviewer Question',
        leadAnswer: '',
        bullets: [],
        tradeOff: ''
      };

      const lines = raw.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('💬') || trimmed.toLowerCase().startsWith('summarized question:')) continue;

        if (trimmed.startsWith('⭐') || trimmed.toLowerCase().startsWith('answer:')) {
          modeA.leadAnswer = trimmed.replace(/^⭐\s*Answer:\s*|^Answer:\s*/i, '').trim();
          continue;
        }

        if (trimmed.toLowerCase().startsWith('trade-off:') || trimmed.toLowerCase().startsWith('tradeoff:')) {
          modeA.tradeOff = trimmed.replace(/^trade-off:\s*|^tradeoff:\s*/i, '').trim();
          continue;
        }

        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.match(/^\d+\./)) {
          const bullet = trimmed.replace(/^[•\-\*]\s*|^\d+\.\s*/, '');
          if (bullet) modeA.bullets.push(bullet);
        } else if (trimmed.length > 0 && !modeA.leadAnswer) {
          modeA.leadAnswer = trimmed;
        } else if (trimmed.length > 0) {
          modeA.bullets.push(trimmed);
        }
      }

      return modeA;
    }
  }, [streamingAnswer, currentQuestion]);

  // Syntax highlighting for code block
  const highlightedCode = useMemo(() => {
    if (!parsedContent?.code) return '';
    try {
      const lang = (parsedContent.language || 'python').toLowerCase();
      const grammar =
        Prism.languages[lang] ||
        Prism.languages.python ||
        Prism.languages.javascript ||
        Prism.languages.cpp;
      return Prism.highlight(parsedContent.code, grammar, lang);
    } catch {
      return parsedContent.code;
    }
  }, [parsedContent]);

  const displayTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="interactive-hud-element answer-panel-card bg-[#18181c]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 shadow-2xl text-neutral-200 mt-2 w-full mx-auto relative select-text flex flex-col overflow-hidden app-no-drag transition-all pointer-events-auto"
      style={panelHeight ? { maxHeight: `${panelHeight}px`, height: `${panelHeight}px` } : { maxHeight: '520px' }}
    >
      {/* ── 1. Top Bar of Card (Pagination & Clear) ── */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 shrink-0">
        {/* Left Pagination Controls (⌘← / ⌘→) */}
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={onPrevQuestion}
            disabled={!hasPrev}
            className="px-2 py-0.5 rounded-lg bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/10 text-sm font-medium flex items-center space-x-1 transition-colors disabled:opacity-30 cursor-pointer shadow-xs active:scale-95"
            title="Previous question (⌘←)"
          >
            <span>⌘←</span>
          </button>

          <button
            type="button"
            onClick={onNextQuestion}
            disabled={!hasNext}
            className="px-2 py-0.5 rounded-lg bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/10 text-sm font-medium flex items-center space-x-1 transition-colors disabled:opacity-30 cursor-pointer shadow-xs active:scale-95"
            title="Next question (⌘→)"
          >
            <span>⌘→</span>
          </button>

          {totalQuestions > 1 && (
            <span className="text-[12px] text-neutral-400 font-mono pl-1">
              {currentIndex + 1} of {totalQuestions}
            </span>
          )}
        </div>

        {/* Right Controls (Clear ⌘⌫, Close) */}
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={onClearCard}
            className="px-2.5 py-0.5 rounded-lg bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/10 text-sm font-medium flex items-center space-x-1 transition-colors cursor-pointer shadow-xs active:scale-95"
            title="Clear active answer card (⌘⌫)"
          >
            <span>Clear</span>
            <span className="text-[12px] text-neutral-400 font-mono">⌘⌫</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Close card"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── 2. Scrollable Content Body ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar space-y-3.5 pr-1 font-sans text-sm"
      >
        {/* In-Place Screen Analysis Loading Skeleton */}
        {isAnalyzingScreen && !streamingAnswer && (
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-sm text-emerald-300 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-white tracking-wide">
                Analyzing on-screen challenge with Gemini Flash Vision...
              </span>
            </div>
            <div className="space-y-1.5 pl-4">
              <div className="h-2 bg-white/10 rounded-full w-4/5 animate-pulse" />
              <div className="h-2 bg-white/10 rounded-full w-3/5 animate-pulse" />
            </div>
          </div>
        )}

        {/* Verbal / Manual In-Progress Generating Indicator */}
        {!isAnalyzingScreen && isGenerating && !streamingAnswer && (
          <div className="flex items-center space-x-2.5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-sm text-emerald-300 font-mono animate-pulse">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-emerald-300">⭐ Thinking & formulating answer...</span>
          </div>
        )}

        {/* Standby Empty State */}
        {!streamingAnswer && !isGenerating && !isAnalyzingScreen && (
          <div className="h-36 flex flex-col items-center justify-center text-center p-4 text-neutral-500">
            <Sparkles className="w-7 h-7 text-neutral-600 mb-2 animate-pulse" />
            <p className="text-sm font-semibold text-neutral-300">Ready for Interview Question</p>
            <p className="text-[13px] text-neutral-500 mt-0.5 max-w-xs">
              Spoken questions and code solutions appear directly here.
            </p>
          </div>
        )}

        {/* ── Question Header (💬 Question:) ── */}
        {(parsedContent?.question || currentQuestion) && (
          <div className="flex items-start justify-between space-x-2 leading-relaxed">
            <div className="text-neutral-100 text-sm">
              <span className="font-bold text-white mr-1.5 flex-shrink-0">
                💬 Question:
              </span>
              <span className="font-semibold text-white">
                {(parsedContent?.question || currentQuestion || '').replace(/^💬\s*(?:Summarized\s*)?(?:question|problem):\s*/i, '')}
              </span>
            </div>

            <button
              onClick={handleCopyQuestion}
              className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              title="Copy question text"
            >
              {copiedQuestion ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        )}

        {/* ── MODE A: Verbal / Architecture / STAR Render ── */}
        {streamingAnswer && parsedContent?.type === 'verbal' && (
          <div className="space-y-3 pt-1">
            {/* Lead Answer (⭐ Answer:) */}
            {parsedContent.leadAnswer && (
              <div className="text-neutral-100 font-medium leading-relaxed">
                <span className="font-bold text-amber-400 mr-1.5">⭐ Answer:</span>
                <span className="text-neutral-100 font-semibold">{parsedContent.leadAnswer}</span>
              </div>
            )}

            {/* Bullet Points */}
            {parsedContent.bullets.length > 0 && (
              <div className="space-y-2 leading-relaxed text-neutral-200">
                {parsedContent.bullets.map((bullet, idx) => (
                  <div key={idx} className="flex items-start space-x-2">
                    <span className="text-emerald-400 font-bold mt-0.5 shrink-0">•</span>
                    <p className="text-neutral-200 flex-1">
                      {renderFormattedInlineText(bullet)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Trade-off / Note Block */}
            {parsedContent.tradeOff && (
              <div className="pt-2 text-neutral-300 text-sm font-sans italic border-t border-white/5">
                <strong className="text-neutral-200 not-italic font-semibold mr-1">Trade-off:</strong>
                {renderFormattedInlineText(parsedContent.tradeOff)}
              </div>
            )}
          </div>
        )}

        {/* ── MODE B: Coding / LeetCode / Screen Solution Render ── */}
        {streamingAnswer && parsedContent?.type === 'coding' && (
          <div className="space-y-3 pt-1">
            <div className="text-sm font-bold text-emerald-400 flex items-center space-x-1">
              <span>⭐ Answer:</span>
            </div>

            {/* Intuition */}
            {parsedContent.intuition && (
              <div className="space-y-1">
                <div className="font-bold text-white text-sm">Intuition:</div>
                <p className="text-neutral-300 leading-relaxed text-sm">
                  {renderFormattedInlineText(parsedContent.intuition)}
                </p>
              </div>
            )}

            {/* Algorithm Steps */}
            {parsedContent.algorithm.length > 0 && (
              <div className="space-y-1">
                <div className="font-bold text-white text-sm">Algorithm:</div>
                <ul className="space-y-1 pl-4 list-disc list-outside text-neutral-300 leading-relaxed text-sm">
                  {parsedContent.algorithm.map((step, idx) => (
                    <li key={idx} className="pl-0.5">
                      {renderFormattedInlineText(step)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Syntax-Highlighted Code Block */}
            {parsedContent.code && (
              <div className="space-y-1 pt-1">
                <div className="font-bold text-white text-sm capitalize">
                  Implementation ({parsedContent.language}):
                </div>
                <div className="bg-[#1e1e24] border border-white/10 rounded-xl p-3.5 font-mono text-sm overflow-x-auto relative group shadow-inner">
                  <button
                    onClick={() => handleCopyCode(parsedContent.code)}
                    className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 text-[12px] text-neutral-300 flex items-center space-x-1 transition-all cursor-pointer shadow-xs"
                    title="Copy clean code"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-neutral-400" />}
                    <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>

                  <pre className="text-neutral-100 font-mono leading-relaxed pt-1">
                    <code
                      dangerouslySetInnerHTML={{
                        __html: highlightedCode || parsedContent.code
                      }}
                    />
                  </pre>
                </div>
              </div>
            )}

            {/* Logic / Edge Case Bullets */}
            {parsedContent.bullets?.length > 0 && (
              <div className="space-y-1.5 pt-1 text-neutral-200 leading-relaxed text-sm">
                {parsedContent.bullets.map((bullet, idx) => (
                  <div key={idx} className="flex items-start space-x-2">
                    <span className="text-emerald-400 font-bold shrink-0">•</span>
                    <p className="text-neutral-200 flex-1">
                      {renderFormattedInlineText(bullet)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Complexity Analysis */}
            {(parsedContent.timeComplexity || parsedContent.spaceComplexity) && (
              <div className="space-y-0.5 pt-1 text-neutral-300 text-sm">
                {parsedContent.timeComplexity && (
                  <div>
                    <strong className="text-white">Time Complexity:</strong>{' '}
                    {renderFormattedInlineText(parsedContent.timeComplexity)}
                  </div>
                )}
                {parsedContent.spaceComplexity && (
                  <div>
                    <strong className="text-white">Space Complexity:</strong>{' '}
                    {renderFormattedInlineText(parsedContent.spaceComplexity)}
                  </div>
                )}
              </div>
            )}

            {/* Trade-off */}
            {parsedContent.tradeOff && (
              <div className="pt-2 text-neutral-300 text-sm italic border-t border-white/5">
                <strong className="text-neutral-200 not-italic font-semibold mr-1">Trade-off:</strong>
                {renderFormattedInlineText(parsedContent.tradeOff)}
              </div>
            )}
          </div>
        )}

        {/* ── MODE C: Pseudocode Render ── */}
        {streamingAnswer && parsedContent?.type === 'pseudocode' && (
          <div className="space-y-3 pt-1">
            <div className="text-sm font-bold text-cyan-400">
              <span>⭐ Pseudocode:</span>
            </div>

            <div className="bg-[#1e1e24] border border-cyan-500/20 rounded-xl p-3.5 font-mono text-sm overflow-x-auto relative shadow-inner">
              <button
                onClick={() => handleCopyCode(parsedContent.pseudocode)}
                className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 text-[12px] text-neutral-300 flex items-center space-x-1 transition-all cursor-pointer shadow-xs"
                title="Copy pseudocode"
              >
                {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-neutral-400" />}
                <span>{copiedCode ? 'Copied' : 'Copy'}</span>
              </button>

              <pre className="text-cyan-200 font-mono leading-relaxed pt-1">
                <code>{parsedContent.pseudocode}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Active Typing Cursor */}
        {(isGenerating || isAnalyzingScreen) && (
          <span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-1 translate-y-0.5 animate-cursor-blink" />
        )}

        {/* Chat / Follow-up Input Box (shown if isChatOpen is true) */}
        {isChatOpen && (
          <div className="pt-2 border-t border-white/10 space-y-2 animate-in fade-in duration-100">
            {hasActiveCode && (
              <div className="flex items-center space-x-1.5 text-[12px] text-emerald-400 font-mono px-1">
                <span>💻</span>
                <span className="text-neutral-400">Context:</span>
                <span className="text-emerald-300 font-semibold truncate max-w-[320px]">
                  {activeCodeTitle || 'Active Screen Problem'}
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleSendFollowup('Write clean step-by-step pseudocode for this solution')}
                className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/10 text-[12px] font-medium flex items-center space-x-1 transition-all cursor-pointer shadow-xs"
              >
                <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                <span>📝 Pseudocode</span>
              </button>

              <button
                type="button"
                onClick={() => handleSendFollowup('Explain the intuition, variables, and line-by-line mechanics of this solution')}
                className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/10 text-[12px] font-medium flex items-center space-x-1 transition-all cursor-pointer shadow-xs"
              >
                <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                <span>🔍 Explain Code</span>
              </button>

              <button
                type="button"
                onClick={() => handleSendFollowup('Perform a step-by-step dry run on this code with a concrete example walkthrough')}
                className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-white/10 text-[12px] font-medium flex items-center space-x-1 transition-all cursor-pointer shadow-xs"
              >
                <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />
                <span>🧪 Dry Run with Example</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendFollowup();
              }}
              className="flex items-center space-x-1.5 bg-neutral-900/90 border border-white/10 rounded-xl px-2.5 py-1 focus-within:border-emerald-500/50 transition-all shadow-inner"
            >
              <input
                type="text"
                value={followupInput}
                onChange={(e) => setFollowupInput(e.target.value)}
                placeholder={hasActiveCode ? "Ask follow-up about active code (⌘↵)..." : "Ask follow-up question (⌘↵)..."}
                className="bg-transparent border-none text-neutral-200 placeholder-neutral-500 text-sm w-full focus:outline-none py-0.5"
              />
              <button
                type="submit"
                disabled={!followupInput.trim()}
                className="p-1 rounded-md text-neutral-400 hover:text-emerald-400 disabled:opacity-30 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── 3. Card Footer (Timestamp & Feedback Icons) ── */}
      <div className="pt-2.5 mt-2 border-t border-white/10 flex items-center justify-between text-[13px] text-neutral-400 shrink-0 select-none">
        <div className="flex items-center space-x-1 text-neutral-400">
          <span>Answer • {displayTime}</span>
        </div>

        {/* Thumbs Up / Down Feedback */}
        <div className="flex items-center space-x-1 pr-3">
          <button
            type="button"
            onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              feedback === 'up' ? 'text-emerald-400 bg-emerald-500/10' : 'text-neutral-400 hover:text-white hover:bg-white/10'
            }`}
            title="Good answer"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              feedback === 'down' ? 'text-rose-400 bg-rose-500/10' : 'text-neutral-400 hover:text-white hover:bg-white/10'
            }`}
            title="Needs improvement"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Interactive Corner Resize Grabber (⤡) ── */}
      {onStartResize && (
        <div
          onMouseDown={onStartResize}
          className="absolute bottom-1 right-1 p-1 text-neutral-500 hover:text-emerald-400 active:text-emerald-300 cursor-nwse-resize transition-all select-none z-30 group"
          title="Drag to resize HUD width and height"
        >
          <svg className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="12" y1="2" x2="2" y2="12" strokeLinecap="round" />
            <line x1="12" y1="6" x2="6" y2="12" strokeLinecap="round" />
            <line x1="12" y1="10" x2="10" y2="12" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
