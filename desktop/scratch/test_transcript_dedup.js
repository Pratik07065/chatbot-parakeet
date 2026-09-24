/**
 * Automated verification test for transcript state management
 * Tests:
 * 1. Interim replacement (never appending)
 * 2. Finalization (moving interim to confirmed history and clearing interim)
 * 3. Exact sentence deduplication (no "experience. experience.")
 * 4. Multi-sentence progression
 * 5. 30-word FIFO sliding window
 */

const MAX_WORDS = 30;

function createTranscriptStateManager() {
  let confirmedHistory = '';
  let interimTranscript = '';

  function handleIncomingTranscript(newText, isFinal = false) {
    if (!newText || !newText.trim()) return;
    const cleanText = newText.trim();

    if (isFinal) {
      if (confirmedHistory && (confirmedHistory === cleanText || confirmedHistory.endsWith(` ${cleanText}`) || confirmedHistory.endsWith(cleanText))) {
        // Deduplicate duplicate finalized arrival
        interimTranscript = '';
        return;
      }
      const updated = confirmedHistory ? `${confirmedHistory} ${cleanText}` : cleanText;
      const words = updated.split(/\s+/).filter(Boolean);
      if (words.length > MAX_WORDS) {
        confirmedHistory = words.slice(words.length - MAX_WORDS).join(" ");
      } else {
        confirmedHistory = updated;
      }
      interimTranscript = '';
    } else {
      interimTranscript = cleanText; // REPLACE, do NOT do prev + text
    }
  }

  function getEffectiveText() {
    const confirmed = confirmedHistory.trim();
    const transient = interimTranscript.trim();
    const combined = confirmed && transient
      ? `${confirmed} ${transient}`
      : (confirmed || transient || '');

    const words = combined.split(/\s+/).filter(Boolean);
    return words.length > MAX_WORDS ? words.slice(words.length - MAX_WORDS).join(' ') : combined;
  }

  return {
    handleIncomingTranscript,
    getEffectiveText,
    getState: () => ({ confirmedHistory, interimTranscript })
  };
}

console.log("=== RUNNING TRANSCRIPTION DEDUPLICATION AND REPLACEMENT TEST ===");

const manager = createTranscriptStateManager();

// 1. Simulating streaming sentence: "Tell me about your experience."
console.log("\n--- Phase 1: Incoming Interim Stream ---");
const interimSteps = [
  "Tell",
  "Tell me",
  "Tell me about",
  "Tell me about your",
  "Tell me about your experience."
];

interimSteps.forEach((text, i) => {
  manager.handleIncomingTranscript(text, false);
  const current = manager.getEffectiveText();
  console.log(`  Step ${i + 1} (Interim: '${text}'): Display -> "${current}"`);
  if (current !== text) {
    console.error(`  FAIL: Expected "${text}" but got "${current}"`);
    process.exit(1);
  }
});
console.log("[PASS] All interim steps replaced cleanly without stuttering or concatenation!");

// 2. Finalization step
console.log("\n--- Phase 2: Finalization Step ---");
manager.handleIncomingTranscript("Tell me about your experience.", true);
let current = manager.getEffectiveText();
console.log(`  Finalized: Display -> "${current}"`);
if (current !== "Tell me about your experience.") {
  console.error(`  FAIL: Expected "Tell me about your experience." but got "${current}"`);
  process.exit(1);
}
console.log("[PASS] Finalized sentence established cleanly!");

// 3. Duplicate final packet delivery (e.g. from both sockets or retry)
console.log("\n--- Phase 3: Duplicate Delivery Protection ---");
manager.handleIncomingTranscript("Tell me about your experience.", true);
current = manager.getEffectiveText();
console.log(`  Duplicate Final Event: Display -> "${current}"`);
if (current !== "Tell me about your experience.") {
  console.error(`  FAIL: Duplication occurred! Got "${current}"`);
  process.exit(1);
}
console.log("[PASS] Duplicate packet ignored; no repeated words!");

// 4. Second sentence in progress
console.log("\n--- Phase 4: Second Spoken Sentence ---");
manager.handleIncomingTranscript("and your work", false);
current = manager.getEffectiveText();
console.log(`  Sentence 2 Interim: Display -> "${current}"`);
if (current !== "Tell me about your experience. and your work") {
  console.error(`  FAIL: Expected "Tell me about your experience. and your work" but got "${current}"`);
  process.exit(1);
}

manager.handleIncomingTranscript("and your work with FastAPI.", true);
current = manager.getEffectiveText();
console.log(`  Sentence 2 Final: Display -> "${current}"`);
if (current !== "Tell me about your experience. and your work with FastAPI.") {
  console.error(`  FAIL: Expected combined sentence but got "${current}"`);
  process.exit(1);
}
console.log("[PASS] Multi-sentence flow verified!");

// 5. 30-word rolling FIFO window
console.log("\n--- Phase 5: 30-Word Sliding FIFO Window ---");
for (let i = 1; i <= 35; i++) {
  manager.handleIncomingTranscript(`word${i}`, true);
}
current = manager.getEffectiveText();
const wordCount = current.split(/\s+/).length;
console.log(`  After 35 single-word additions: Word count -> ${wordCount} words`);
console.log(`  Oldest word in buffer -> "${current.split(' ')[0]}"`);
console.log(`  Newest word in buffer -> "${current.split(' ').slice(-1)[0]}"`);
if (wordCount > 30) {
  console.error(`  FAIL: Window exceeded 30 words: ${wordCount}`);
  process.exit(1);
}
if (!current.startsWith("word6") || !current.endsWith("word35")) {
  console.error(`  FAIL: FIFO sliding window bounds incorrect! Current: ${current}`);
  process.exit(1);
}
console.log("[PASS] Sliding FIFO window correctly maintains max 30 words, dropping oldest!");

console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
