import asyncio
import sys
import os

# Add core-engine root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from llm.generator import answer_generator, STRICT_COPILOT_SYSTEM_PROMPT

async def test_strict_grounding():
    print("=== Testing Strict Copilot Grounding & Anti-Hallucination Prompt ===")

    # 1. Verify Prompt contents
    assert "STRICT TRUTH ON EXPERIENCE & YEARS" in STRICT_COPILOT_SYSTEM_PROMPT
    assert "TELL ME ABOUT YOURSELF" in STRICT_COPILOT_SYSTEM_PROMPT
    assert "💬 Summarized question:" in STRICT_COPILOT_SYSTEM_PROMPT
    assert "⭐ Answer:" in STRICT_COPILOT_SYSTEM_PROMPT
    print("[OK] Strict system prompt verified.")

    # 2. Test Case A: "Tell me about yourself" with resume context
    resume_context = """--- CANDIDATE RESUME EXPERIENCE & DOCUMENT METRICS ---
[1] Senior Full-Stack Engineer with 3 years building low-latency APIs in Python (FastAPI) and React.
[2] Architected real-time WebSocket messaging layer handling 25,000 active concurrent connections with sub-100ms delivery.
[3] Implemented automated CI/CD pipeline using GitHub Actions, reducing deployment time from 45 mins to 6 mins."""

    print("\n--- Test Case A: 'Tell me about yourself' ---")
    tokens_a = []
    async for token in answer_generator.stream_answer("Tell me about yourself and your recent engineering accomplishments", context=resume_context):
        tokens_a.append(token)
    response_a = "".join(tokens_a)
    print("Response A:\n" + response_a.encode("ascii", "replace").decode("ascii"))

    assert "💬 Summarized question:" in response_a
    assert "⭐ Answer:" in response_a
    assert "As an AI" not in response_a
    assert "I don't know" not in response_a

    # 3. Test Case B: Out-of-scope question (e.g. 5+ years in DevOps & Kubernetes when candidate has 3 years Python)
    print("\n--- Test Case B: Out-of-scope DevOps Experience Question ---")
    tokens_b = []
    async for token in answer_generator.stream_answer("We need someone with 5+ years of dedicated DevOps and Kubernetes infrastructure management. How would you design our cluster topology?", context=resume_context):
        tokens_b.append(token)
    response_b = "".join(tokens_b)
    print("Response B:\n" + response_b.encode("ascii", "replace").decode("ascii"))

    assert "💬 Summarized question:" in response_b
    assert "⭐ Answer:" in response_b
    assert "As an AI" not in response_b
    assert "I don't know" not in response_b

    # Verify bullet point limit (max 3 bullets)
    bullet_count = response_b.count("\n- ") + (1 if response_b.startswith("- ") else 0)
    print(f"Bullet count in answer: {bullet_count}")
    assert bullet_count <= 3

    print("\n>>> ALL STRICT GROUNDING & EVALUATION TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    asyncio.run(test_strict_grounding())
