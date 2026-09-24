import asyncio
import os
import sys

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure core-engine is on sys.path
core_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if core_dir not in sys.path:
    sys.path.insert(0, core_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(core_dir, "..", ".env"))

from llm.generator import answer_generator, SAMPLING_TEMPERATURE

SAMPLE_RESUME = """
Alex Rivera
Full Stack AI & Machine Learning Engineer | Python & Cloud Developer
Skills: Python, FastAPI, PyTorch, Scikit-Learn, React, PostgreSQL, Docker, Redis, Celery.
Experience:
- Senior AI & Backend Engineer at NeuralStream (2022 - Present):
  * Designed and deployed a distributed RAG retrieval pipeline reducing query latency from 800ms to 180ms.
  * Built high-throughput FastAPI microservices processing 2.5M daily document embeddings with PostgreSQL pgvector.
  * Integrated PyTorch-based custom re-ranking models achieving a 94.2% top-3 retrieval accuracy.
Projects:
- Adaptive Semantic Search Engine:
  * Built an open-source vector search orchestrator using PyTorch and FastAPI with hybrid BM25 + dense embedding scoring.
Education:
- B.S. in Computer Science & Data Science, University of California, Berkeley (2018 - 2022)
"""

async def test_live_pipeline():
    print(f"============================================================")
    print(f"VERIFYING NATURAL CONVERSATIONAL LLM PROMPT (Temp = {SAMPLING_TEMPERATURE})")
    print(f"============================================================\n")

    # Test 1: "Tell me about yourself" conversational structure
    print("--- [TEST 1: 'Tell me about yourself' Conversational Depth] ---")
    tokens_1 = []
    async for token in answer_generator.stream_answer(
        question="Tell me about yourself and your background",
        context=SAMPLE_RESUME,
        provider="groq"
    ):
        tokens_1.append(token)
    answer_1 = "".join(tokens_1)
    word_count_1 = len(answer_1.split())
    print(f"Intro Response ({len(tokens_1)} tokens, {word_count_1} words):\n{answer_1}\n")
    
    # Assertions for structure and conversational depth
    assert ("NeuralStream" in answer_1 or "Neural" in answer_1 or "Alex" in answer_1), "Expected candidate resume details"
    assert "40k+ TPS" not in answer_1, "Found hallucinated metric"
    assert word_count_1 >= 100, f"Expected rich conversational answer, got {word_count_1} words"

    # Test 2: General Technical Question ("What is Docker?")
    print("--- [TEST 2: Technical Concept 'What is Docker?'] ---")
    tokens_2 = []
    async for token in answer_generator.stream_answer(
        question="What is Docker and how does containerization work?",
        context=SAMPLE_RESUME,
        provider="groq"
    ):
        tokens_2.append(token)
    answer_2 = "".join(tokens_2)
    word_count_2 = len(answer_2.split())
    print(f"Tech Response ({len(tokens_2)} tokens, {word_count_2} words):\n{answer_2}\n")
    assert "Docker" in answer_2, "Expected Docker definition"
    assert ("namespace" in answer_2.lower() or "cgroup" in answer_2.lower() or "container" in answer_2.lower() or "isolation" in answer_2.lower())

    # Test 3: Out-of-scope question ("Do you have 5+ years of Kubernetes & DevOps?")
    print("--- [TEST 3: Out of Scope Question with Honest Bridging] ---")
    tokens_3 = []
    async for token in answer_generator.stream_answer(
        question="Do you have 5+ years of experience managing Kubernetes clusters and DevOps infrastructure?",
        context=SAMPLE_RESUME,
        provider="groq"
    ):
        tokens_3.append(token)
    answer_3 = "".join(tokens_3)
    print(f"Out of Scope Response:\n{answer_3}\n")
    assert "40k+ TPS" not in answer_3, "Found hallucinated metric"

    print("============================================================")
    print("ALL NATURAL CONVERSATIONAL COPILOT TESTS PASSED!")
    print("============================================================")

if __name__ == "__main__":
    asyncio.run(test_live_pipeline())
