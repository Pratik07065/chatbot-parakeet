import re

INTERVIEW_INTENT_PATTERNS = [
    # 1. Interrogative Starters (Wh- questions)
    r"^(what|why|how|when|where|who|which|whose|whom)\b",
    # 2. Modal & Auxiliary Verbs
    r"^(can|could|would|will|do|does|did|have|has|had|is|are|was|were|should)\s+(you|we|i)\b",
    # 3. Imperative & Command Prompts
    r"^(explain|describe|walk\s+me\s+through|tell\s+me\s+about|elaborate(\s+on)?|clarify|give\s+(an?\s+)?example|give\s+me|show\s+me|discuss|detail|highlight|summarize|compare|differentiate|differences?(\s+between)?|pros\s+and\s+cons(\s+of)?)\b",
    # 4. Experience & Competency Queries
    r"(your\s+experience|your\s+background|your\s+projects?|have\s+you\s+ever|how\s+did\s+you|experience\s+(in|with)|background\s+in|familiar\s+with|worked\s+on|knowledge\s+of)",
]

FILLER_WORDS_REGEX = re.compile(
    r"^(so|okay|ok|well|now|alright|um|uh|hey|and|then|yeah|listen|right|like|moving\s+on)\s*[,.-]*\s*",
    re.IGNORECASE,
)

DANGLING_ENDINGS_REGEX = re.compile(
    r"\b("
    r"is|are|was|were|be|been|being|"
    r"do|does|did|"
    r"have|has|had|"
    r"can|could|would|will|should|shall|may|might|must|"
    r"the|a|an|"
    r"of|to|for|with|in|on|at|by|from|about|into|through|during|before|after|above|below|between|"
    r"and|or|but|so|because|if|then|as|than|"
    r"your|my|our|their|his|her|its|"
    r"that|this|these|those|which|what|how|why|where|when|who|"
    r"like|um|uh|er|ah|you\s+know|"
    r"choose|explain|tell|describe|discuss|detail|elaborate|"
    r"(tell|show|give|ask)\s+(me|us)|"
    r"(can|could|would|will|do|does|did|have|has|are|were|should)\s+(you|we|i)|"
    r"(can|could|would|will|do|does|did|should)\s+(you|we|i)\s+(tell|explain|describe|show|give)|"
    r"(can|could|would|will|do|does|did|should)\s+(you|we|i)\s+(tell|show|give)\s+(me|us)"
    r")\s*[\.\,\-\…\?]*$",
    re.IGNORECASE
)

BARE_STARTER_REGEX = re.compile(
    r"^(what|why|how|when|where|who|which|whose|whom|"
    r"can\s+you|could\s+you|would\s+you|will\s+you|do\s+you|did\s+you|have\s+you|are\s+you|"
    r"explain|describe|tell\s+me|tell\s+me\s+about|walk\s+me\s+through|elaborate|clarify|"
    r"give\s+me|give\s+an\s+example|compare|difference\s+between)\s*[\.\,\-\…\?]*$",
    re.IGNORECASE
)


def is_interview_question(text: str) -> bool:
    if not text:
        return False
    raw_clean = text.strip()
    if not raw_clean:
        return False
    if raw_clean.endswith("?"):
        return True
    cleaned = raw_clean.lower()
    cleaned = FILLER_WORDS_REGEX.sub("", cleaned).strip()
    words = cleaned.split()
    if len(words) < 2:
        return False
    for pattern in INTERVIEW_INTENT_PATTERNS:
        if re.search(pattern, cleaned, re.IGNORECASE):
            return True
    return False


def is_semantically_complete_inquiry(text: str) -> bool:
    if not text or not text.strip():
        return False
    cleaned = text.strip()
    # Strip trailing ellipsis/dashes
    cleaned_no_punct = re.sub(r"[\.\-\…]+$", "", cleaned).strip()
    if not cleaned_no_punct:
        return False

    # 1. Reject if ending with dangling words
    if DANGLING_ENDINGS_REGEX.search(cleaned_no_punct):
        return False

    # 2. Reject bare starter phrase
    norm = FILLER_WORDS_REGEX.sub("", cleaned_no_punct).strip()
    if BARE_STARTER_REGEX.match(norm):
        return False

    words = norm.split()
    word_count = len(words)

    # 3. Explicit question mark
    if cleaned.endswith("?"):
        if word_count >= 2:
            return True
        return False

    # 4. Without '?', must match recognized interview intent
    if not is_interview_question(norm):
        return False

    # Wh- / modal / imperative prompts without '?' must have substantive content (>= 3 words)
    if word_count < 3:
        return False

    return True


def extract_question_boundary(text: str) -> str:
    """Extract clean inquiry clause from conversational text."""
    if not text or not text.strip():
        return ""
    
    sentences = re.split(r"(?<=[.?!])\s+", text.strip())
    
    start_idx = None
    for idx, s in enumerate(sentences):
        if is_interview_question(s) or any(re.search(p, s.lower()) for p in INTERVIEW_INTENT_PATTERNS):
            start_idx = idx
            break
            
    if start_idx is not None:
        extracted = " ".join(sentences[start_idx:]).strip()
    else:
        extracted = text.strip()
        
    extracted = FILLER_WORDS_REGEX.sub("", extracted).strip()
    if extracted:
        extracted = extracted[0].upper() + extracted[1:]
    return extracted


# Test assertions
incomplete_fragments = [
    "What is",
    "What is...",
    "What is the",
    "Can you",
    "Can you explain",
    "Could you tell me",
    "Explain how",
    "How do",
    "Why did",
    "Tell me about your",
    "Have you worked with",
    "Difference between",
    "What",
    "How",
    "Why did you choose",
    "Explain the",
]

complete_inquiries = [
    "What is Docker?",
    "What is Docker",
    "Can you explain how Kafka achieves high throughput?",
    "Can you explain how Kafka achieves high throughput",
    "Explain your project",
    "Tell me about your experience with Kubernetes",
    "Difference between TCP and UDP",
    "How does the V8 JavaScript engine work?",
    "Have you ever built a machine learning pipeline",
    "What are your greatest strengths?",
    "Why should we hire you",
]

print("=== INCOMPLETE FRAGMENTS (Must all be False) ===")
for frag in incomplete_fragments:
    res = is_semantically_complete_inquiry(frag)
    print(f"  [{'PASS' if not res else 'FAIL'}] '{frag}' -> {res}")
    assert not res, f"Expected False for fragment: {frag}"

print("\n=== COMPLETE INQUIRIES (Must all be True) ===")
for inq in complete_inquiries:
    res = is_semantically_complete_inquiry(inq)
    print(f"  [{'PASS' if res else 'FAIL'}] '{inq}' -> {res}")
    assert res, f"Expected True for complete inquiry: {inq}"

print("\n=== QUESTION BOUNDARY EXTRACTION ===")
banter = "That makes total sense. Thanks for explaining. Moving on, what is gradient descent?"
boundary = extract_question_boundary(banter)
print(f"  Original: '{banter}'")
print(f"  Extracted: '{boundary}'")
assert "what is gradient descent" in boundary.lower(), f"Failed extraction: {boundary}"

print("\nALL SCRATCH TESTS PASSED!")
