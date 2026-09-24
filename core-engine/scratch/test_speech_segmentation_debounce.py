import asyncio
import time
import re
import sys
import os

# Set path for core-engine imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import (
    is_semantically_complete_inquiry,
    extract_question_boundary,
    SlidingTranscriptBuffer,
    on_stt_event,
    ws_manager,
)
import main

# Test reporting
tests_passed = 0
tests_total = 0


def record_result(name: str, passed: bool, detail: str = ""):
    global tests_passed, tests_total
    tests_total += 1
    if passed:
        tests_passed += 1
        print(f"  [PASS] {name} {detail}")
    else:
        print(f"  [FAIL] {name} {detail}")
        assert False, f"Test failed: {name} - {detail}"


async def run_tests():
    print("==================================================================")
    print("TEST 1: Incomplete Fragments vs Complete Inquiries Verification")
    print("==================================================================")

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
        "Can you tell me about",
        "Would you explain",
    ]

    for frag in incomplete_fragments:
        res = is_semantically_complete_inquiry(frag)
        record_result(f"Fragment '{frag}' rejected", res is False, f"(Got: {res})")

    complete_inquiries = [
        "What is Docker?",
        "What is Docker",
        "Can you explain how Kafka achieves high throughput?",
        "Can you explain how Kafka achieves high throughput",
        "Explain your project",
        "Tell me about your experience with Kubernetes",
        "Difference between TCP and UDP",
        "Differences between TCP and UDP",
        "How does the V8 JavaScript engine work?",
        "Have you ever built a machine learning pipeline",
        "What are your greatest strengths?",
        "Why should we hire you",
        "Pros and cons of microservices",
    ]

    for inq in complete_inquiries:
        res = is_semantically_complete_inquiry(inq)
        record_result(f"Inquiry '{inq}' accepted", res is True, f"(Got: {res})")

    print("\n==================================================================")
    print("TEST 2: Conversational Boundary Extraction")
    print("==================================================================")

    banter_samples = [
        ("Okay, that makes sense. Moving on, what is gradient descent?", "What is gradient descent?"),
        ("Thanks for explaining that. Now, can you explain how Kafka works?", "Can you explain how Kafka works?"),
        ("Alright, great. Explain your experience with Kubernetes.", "Explain your experience with Kubernetes."),
        ("Very clear answer. So, tell me about your background.", "Tell me about your background."),
    ]

    for raw, expected in banter_samples:
        extracted = extract_question_boundary(raw)
        record_result(
            f"Extract boundary from '{raw[:35]}...'",
            expected.lower() in extracted.lower(),
            f"(Extracted: '{extracted}')"
        )

    print("\n==================================================================")
    print("TEST 3: Mid-Sentence Pause Stitching Across Split STT Packets")
    print("==================================================================")

    fired_questions = []

    async def mock_trigger(q: str, provider=None, resume_id=None):
        fired_questions.append(q)

    # Intercept ws_manager.trigger_answer_stream
    orig_trigger = ws_manager.trigger_answer_stream
    ws_manager.trigger_answer_stream = mock_trigger

    # Reset backend state
    main.sliding_transcript_buffer.clear()
    main.last_answered_question = ""
    main.last_handled_timestamp = 0.0
    if main.pending_question_task and not main.pending_question_task.done():
        main.pending_question_task.cancel()
    main.pending_question_task = None
    main.pending_question_text = ""

    # 1. Packet 1 arrives: "What is" (incomplete)
    await on_stt_event({
        "type": "transcript",
        "text": "What is",
        "is_final": True,
        "speaker": "interviewer",
    })

    # Verify no question fired and no pending task
    record_result("Packet 1 ('What is') did not fire", len(fired_questions) == 0)
    record_result("Packet 1 did not arm debounce task", main.pending_question_task is None)

    # 2. Simulate 1-second conversational hesitation/pause
    await asyncio.sleep(0.1)  # simulated test sleep

    # 3. Packet 2 arrives: "Docker?" (completes the inquiry)
    await on_stt_event({
        "type": "transcript",
        "text": "Docker?",
        "is_final": True,
        "speaker": "interviewer",
    })

    # Verify debounce task is armed with the stitched question
    record_result("Packet 2 armed debounce task", main.pending_question_task is not None)
    record_result(
        "Debounce task has stitched text 'What is Docker?'",
        main.pending_question_text == "What is Docker?" or "what is docker" in main.pending_question_text.lower(),
        f"(Pending: '{main.pending_question_text}')"
    )

    # 4. Wait for 1.3s debounce timer to fire
    print("  [WAIT] Waiting 1.4s for debounce timer to fire...")
    await asyncio.sleep(1.4)

    record_result("Stitched question fired to LLM", len(fired_questions) == 1)
    if fired_questions:
        record_result(
            "Fired question matches 'What is Docker?'",
            "what is docker" in fired_questions[0].lower(),
            f"(Fired: '{fired_questions[0]}')"
        )

    print("\n==================================================================")
    print("TEST 4: Trailing Continuation Stitching (Speaker keeps speaking)")
    print("==================================================================")

    fired_questions.clear()
    main.sliding_transcript_buffer.clear()
    main.last_answered_question = ""
    main.last_handled_timestamp = 0.0

    # 1. Speaker says "What is Docker"
    await on_stt_event({
        "type": "transcript",
        "text": "What is Docker",
        "is_final": True,
        "speaker": "interviewer",
    })
    record_result("Armed first part 'What is Docker'", main.pending_question_task is not None)

    # 2. Before 1.3s expires (at 0.4s), speaker continues: "and how does containerization work?"
    await asyncio.sleep(0.4)
    await on_stt_event({
        "type": "transcript",
        "text": "and how does containerization work?",
        "is_final": True,
        "speaker": "interviewer",
    })

    record_result(
        "Debounce task rescheduled with continuation",
        "containerization" in main.pending_question_text.lower(),
        f"(Pending: '{main.pending_question_text}')"
    )

    # 3. Wait for new debounce timer
    print("  [WAIT] Waiting 1.4s for rescheduled debounce timer...")
    await asyncio.sleep(1.4)

    record_result("Continuation triggered exactly once", len(fired_questions) == 1)
    if fired_questions:
        record_result(
            "Fired question contains both clauses",
            "docker" in fired_questions[0].lower() and "containerization" in fired_questions[0].lower(),
            f"(Fired: '{fired_questions[0]}')"
        )

    print("\n==================================================================")
    print("TEST 5: Deepgram UtteranceEnd Fast-Path Trigger")
    print("==================================================================")

    fired_questions.clear()
    main.sliding_transcript_buffer.clear()
    main.last_answered_question = ""
    main.last_handled_timestamp = 0.0

    # 1. Speaker says complete question
    await on_stt_event({
        "type": "transcript",
        "text": "Explain your previous project",
        "is_final": True,
        "speaker": "interviewer",
    })
    record_result("Armed question 'Explain your previous project'", main.pending_question_task is not None)

    # 2. Deepgram VAD emits UtteranceEnd after 0.2s
    await asyncio.sleep(0.2)
    start_time = time.time()
    await on_stt_event({
        "type": "utterance_end",
        "speaker": "interviewer",
    })
    # Yield control to let async fast-path task run
    await asyncio.sleep(0.05)
    elapsed = time.time() - start_time

    record_result("UtteranceEnd fast-path fired without waiting 1.3s", len(fired_questions) == 1 and elapsed < 0.3)
    if fired_questions:
        record_result(
            "Fired question matches fast-path",
            "explain your previous project" in fired_questions[0].lower(),
            f"(Fired: '{fired_questions[0]}', Elapsed: {elapsed*1000:.1f}ms)"
        )

    # Restore original trigger
    ws_manager.trigger_answer_stream = orig_trigger

    print("\n==================================================================")
    print(f"SUMMARY: {tests_passed}/{tests_total} assertions passed (100% SUCCESS)")
    print("==================================================================")


if __name__ == "__main__":
    asyncio.run(run_tests())
