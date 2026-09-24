import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from stt.deepgram_stream import is_interview_question, INTERVIEW_INTENT_PATTERNS

def test_intent_patterns():
    print("=== TEST 1: Testing Comprehensive Interview Intent Patterns ===")
    positive_test_cases = [
        "explain your project",
        "can you have experience with FastAPI",
        "tell me about your background",
        "walk me through your resume",
        "so could you elaborate on your experience with Python",
        "what is your background in distributed systems",
        "do you have knowledge of Docker and Kubernetes",
        "are you familiar with event-driven architecture",
        "give an example of resolving a production issue",
        "have you ever worked on high throughput message queues",
        "describe a challenging bug you fixed",
        "clarify how you designed the database schema",
        "highlight your key achievements at your previous company",
        "discuss the trade-offs between SQL and NoSQL",
        "Python vs Go for high-concurrency microservices?",
        "How do you handle database migrations in CI/CD?",
        "Could you tell me why you chose FastAPI?",
        "Would you explain how WebSockets work?",
        "Should we use Kafka or RabbitMQ here?",
    ]

    negative_test_cases = [
        "okay",
        "yeah that makes sense",
        "thank you very much",
        "good morning everyone",
        "alright",
        "cool",
        "i agree with that",
        "let's proceed with the next step",
        "hmm",
    ]

    for phrase in positive_test_cases:
        res = is_interview_question(phrase)
        print(f"  [POSITIVE] {phrase!r:65} -> {res}")
        assert res is True, f"Failed to detect interview prompt: '{phrase}'"

    for phrase in negative_test_cases:
        res = is_interview_question(phrase)
        print(f"  [NEGATIVE] {phrase!r:65} -> {res}")
        assert res is False, f"False positive detected on non-interview statement: '{phrase}'"

    print("All pattern checks passed successfully!")


async def test_debouncing_behavior():
    print("\n=== TEST 2: Testing 1.5s Question Debouncing ===")
    
    triggers = []
    pending_task = None
    last_handled = ""
    last_timestamp = 0.0

    async def simulate_stt_event(text: str):
        nonlocal pending_task, last_handled, last_timestamp
        now = time.time()
        if is_interview_question(text):
            if text.lower() == last_handled.lower() and (now - last_timestamp) < 15.0:
                return

            if pending_task and not pending_task.done():
                pending_task.cancel()

            async def _debounced(q):
                nonlocal last_handled, last_timestamp
                try:
                    await asyncio.sleep(1.5)
                    cur_now = time.time()
                    if q.lower() == last_handled.lower() and (cur_now - last_timestamp) < 15.0:
                        return
                    last_handled = q
                    last_timestamp = cur_now
                    triggers.append((q, time.time()))
                except asyncio.CancelledError:
                    pass

            pending_task = asyncio.create_task(_debounced(text))

    # Simulate split phrases arriving within 0.5s of each other:
    # 1. "Can you tell me..." (at t = 0.0s)
    # 2. "Can you tell me about your experience with FastAPI?" (at t = 0.5s)
    start_time = time.time()
    await simulate_stt_event("Can you tell me")
    await asyncio.sleep(0.5)
    await simulate_stt_event("Can you tell me about your experience with FastAPI?")
    
    # Wait for the 1.5s debounce to fire
    await asyncio.sleep(2.0)

    print(f"Total triggers fired: {len(triggers)}")
    assert len(triggers) == 1, f"Expected exactly 1 debounced trigger, got {len(triggers)}"
    fired_question, fired_time = triggers[0]
    print(f"Fired Question: '{fired_question}' after {fired_time - start_time:.2f}s")
    assert "about your experience with FastAPI" in fired_question
    print("Debouncing validation passed successfully!")


if __name__ == "__main__":
    test_intent_patterns()
    asyncio.run(test_debouncing_behavior())
