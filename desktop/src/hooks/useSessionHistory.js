import { useState, useCallback, useEffect } from 'react';

function normalizeQuestion(q) {
  if (!q) return '';
  return q
    .replace(/^💬\s*(?:Summarized\s*)?(?:question|problem):\s*/i, '')
    .replace(/^(?:question|problem):\s*/i, '')
    .trim()
    .toLowerCase()
    .replace(/[?!.,;:]+$/, '')
    .trim();
}

/**
 * Hook to manage paginated single Q&A session history and keyboard navigation.
 */
export function useSessionHistory(initialItems = []) {
  const [history, setHistory] = useState(initialItems);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Add a new question & answer pair, automatically switching to it or updating in-place
  const addQuestionItem = useCallback((question, answer = '', code = null) => {
    if (!question || !question.trim()) return;
    const cleanQuestion = question.trim();

    setHistory((prev) => {
      const lastIndex = prev.length - 1;
      const normNew = normalizeQuestion(cleanQuestion);

      // Check if the last item is a placeholder, blank, or refers to the same question
      if (lastIndex >= 0) {
        const lastItem = prev[lastIndex];
        const normLast = normalizeQuestion(lastItem.question);

        const isPlaceholder = !lastItem.answer || 
          lastItem.question.toLowerCase().startsWith('reading on-screen') || 
          lastItem.question.toLowerCase().startsWith('thinking') ||
          lastItem.question.toLowerCase() === 'current question';

        const isSameQuestion = (normLast.length > 0 && normNew.length > 0) &&
          (normLast === normNew || normLast.includes(normNew) || normNew.includes(normLast));

        if (isPlaceholder || isSameQuestion) {
          const updated = [...prev];
          const displayTitle = cleanQuestion.startsWith('💬')
            ? cleanQuestion.replace(/^💬\s*(?:Summarized\s*)?(?:question|problem):\s*/i, '').trim()
            : cleanQuestion;

          updated[lastIndex] = {
            ...lastItem,
            question: displayTitle || lastItem.question,
            answer: answer || lastItem.answer,
            code: code !== null ? code : lastItem.code,
          };
          return updated;
        }
      }

      const cleanTitle = cleanQuestion.startsWith('💬')
        ? cleanQuestion.replace(/^💬\s*(?:Summarized\s*)?(?:question|problem):\s*/i, '').trim()
        : cleanQuestion;

      const newItem = {
        id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        question: cleanTitle,
        answer: answer || '',
        code: code,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const nextHistory = [...prev, newItem];
      setCurrentIndex(nextHistory.length - 1);
      return nextHistory;
    });
  }, []);

  // Update in-place question, answer, and/or code for the currently active item
  const updateCurrentItem = useCallback((question = null, answerText = null, code = null) => {
    setHistory((prev) => {
      if (prev.length === 0) {
        if (!question && !answerText) return prev;
        return [{
          id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          question: question ? question.trim() : 'Active Question',
          answer: answerText || '',
          code: code,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }];
      }
      const targetIndex = currentIndex >= 0 && currentIndex < prev.length ? currentIndex : prev.length - 1;
      const updated = [...prev];
      updated[targetIndex] = {
        ...updated[targetIndex],
        question: question && question.trim() ? question.trim() : updated[targetIndex].question,
        answer: answerText !== null && answerText !== undefined ? answerText : updated[targetIndex].answer,
        code: code !== null ? code : updated[targetIndex].code,
      };
      return updated;
    });
  }, [currentIndex]);

  // Update in-place answer for the currently active item
  const updateCurrentAnswer = useCallback((answerText, code = null) => {
    updateCurrentItem(null, answerText, code);
  }, [updateCurrentItem]);

  // Navigate to previous question (⌘←)
  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  // Navigate to next question (⌘→)
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < history.length - 1 ? prev + 1 : prev));
  }, [history.length]);

  // Navigate directly to index
  const goToIndex = useCallback((idx) => {
    if (idx >= 0 && idx < history.length) {
      setCurrentIndex(idx);
    }
  }, [history.length]);

  // Clear current active question card (⌘⌫)
  const clearCurrent = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return [];
      const updated = prev.filter((_, idx) => idx !== currentIndex);
      setCurrentIndex((curr) => {
        if (updated.length === 0) return 0;
        return curr >= updated.length ? updated.length - 1 : curr;
      });
      return updated;
    });
  }, [currentIndex]);

  // Clear all history
  const clearAll = useCallback(() => {
    setHistory([]);
    setCurrentIndex(0);
  }, []);

  // Keyboard navigation listeners (Ctrl/Cmd + Left/Right, Ctrl/Cmd + Backspace)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (isCmdOrCtrl && e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (isCmdOrCtrl && e.key === 'Backspace' && !e.shiftKey) {
        // Prevent default only if not in an input/textarea
        if (!['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
          e.preventDefault();
          clearCurrent();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, clearCurrent]);

  const currentItem = history.length > 0 && currentIndex >= 0 && currentIndex < history.length
    ? history[currentIndex]
    : null;

  return {
    history,
    currentIndex,
    totalQuestions: history.length,
    currentItem,
    addQuestionItem,
    updateCurrentItem,
    updateCurrentAnswer,
    goToPrev,
    goToNext,
    goToIndex,
    clearCurrent,
    clearAll,
    hasPrev: currentIndex > 0,
    hasNext: currentIndex < history.length - 1,
  };
}
