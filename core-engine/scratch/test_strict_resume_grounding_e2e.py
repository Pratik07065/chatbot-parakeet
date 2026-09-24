import asyncio
import os
import sys

# Ensure UTF-8 unbuffered output on Windows
sys.stdout.reconfigure(encoding='utf-8')

# Add core-engine root to python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.context_manager import context_manager, RESUMES_DATA_DIR
from rag.retriever import retrieve_relevant_chunks, is_intro_or_background_query
from llm.generator import answer_generator, is_intro_or_background_question, build_copilot_system_prompt


async def test_grounding_pipeline():
    print("==================================================================", flush=True)
    print("[TEST] STRICT RESUME GROUNDING & ANTI-HALLUCINATION PIPELINE", flush=True)
    print("==================================================================", flush=True)

    # Clean slate
    context_manager.reset_all()

    # 1. Test is_intro_or_background_question detection
    intro_queries = [
        "Tell me about yourself",
        "Walk me through your background and projects",
        "Introduce yourself",
        "Can you walk me through your resume?",
        "Who are you and what is your background?",
    ]
    for q in intro_queries:
        assert is_intro_or_background_question(q), f"Failed to detect intro query: '{q}'"
        assert is_intro_or_background_query(q), f"Retriever failed to detect intro query: '{q}'"
    print("[OK] Intro/background query heuristic classifier verified.", flush=True)

    # 2. Test Case A: NO RESUME LOADED -> Must ask to attach resume
    print("\n--- Test Case A: No Resume Loaded ('Tell me about yourself') ---", flush=True)
    no_resume_context = context_manager.retrieve_context("Tell me about yourself")
    assert "No resume provided" in no_resume_context or no_resume_context == ""
    print(f"Retrieved context for empty state: '{no_resume_context}'", flush=True)

    tokens = []
    async for token in answer_generator.stream_answer("Tell me about yourself", context=no_resume_context, provider="fallback"):
        tokens.append(token)
    response_no_resume = "".join(tokens)
    print("Generated Answer:\n" + response_no_resume, flush=True)

    assert "Please attach your resume" in response_no_resume
    assert "40k+ TPS" not in response_no_resume
    assert "Kubernetes" not in response_no_resume
    assert "Prometheus" not in response_no_resume
    assert "99.99%" not in response_no_resume
    print("[OK] Zero hallucination verified when no resume is loaded.", flush=True)

    # 3. Test Case B: Specific Candidate Resume Loaded
    print("\n--- Test Case B: Real Candidate Resume Loaded ---", flush=True)
    candidate_resume_bytes = b"""
    Sarah Lin - Junior Frontend Developer
    Education: BS in Computer Science, University of Washington (2024)
    Experience:
    - Frontend Intern at HealthCare Solutions (6 months): Built patient portal UI using React, Next.js, and TailwindCSS.
    - Academic Project - EcoTracker: Developed mobile-responsive carbon footprint calculator in React Native.
    Skills: JavaScript, TypeScript, React, Next.js, HTML5, CSS3, Git.
    """
    context_manager.load_resume(candidate_resume_bytes, "Sarah_Lin_Resume.txt", resume_id="res-sarah-2024")
    
    # Verify active context
    active_ctx = context_manager.get_active_context()
    assert "Sarah Lin" in active_ctx
    assert "HealthCare Solutions" in active_ctx
    assert len(active_ctx) > 100
    print(f"[OK] Resume loaded. Extracted {len(active_ctx)} characters.", flush=True)

    # Verify retriever returns full resume profile for intro questions
    intro_ctx = context_manager.retrieve_context("Walk me through your background and projects")
    print(f"[OK] Full profile passed to intro retriever ({len(intro_ctx)} chars).", flush=True)
    assert "Sarah Lin" in intro_ctx
    assert "HealthCare Solutions" in intro_ctx

    # Generate answer with resume context
    tokens_b = []
    async for token in answer_generator.stream_answer("Tell me about yourself and your technical projects", context=intro_ctx, provider="fallback"):
        tokens_b.append(token)
    response_b = "".join(tokens_b)
    print("\nGenerated Answer with Real Resume Context:\n" + response_b, flush=True)

    # Verify Sarah's real details are present and fake metrics are ABSENT
    assert "Sarah Lin" in response_b or "Junior Frontend Developer" in response_b or "HealthCare Solutions" in response_b
    assert "40k+ TPS" not in response_b
    assert "Kubernetes" not in response_b
    assert "Prometheus" not in response_b
    assert "99.99%" not in response_b
    print("[OK] Real candidate details generated with zero fake metrics.", flush=True)

    # 4. Cleanup
    context_manager.reset_all()
    print("\n==================================================================", flush=True)
    print("[SUCCESS] ALL RESUME GROUNDING & EXTRACTION TESTS PASSED!", flush=True)
    print("==================================================================", flush=True)


if __name__ == "__main__":
    asyncio.run(test_grounding_pipeline())
