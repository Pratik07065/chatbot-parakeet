import os
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
from dotenv import load_dotenv
load_dotenv(env_path, override=True)
load_dotenv(override=True)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from llm.generator import answer_generator
answer_generator._init_clients()

MOCK_RESUME_CONTEXT = """
Candidate: Alex Chen
Role: Full-Stack & ML Engineer
Projects:
- FarmEra: Precision agricultural crop yield forecasting platform built with Python, PyTorch, and MongoDB. Achieved 94% prediction accuracy.
- LogPulse: Distributed telemetry aggregation system handling 50k logs/sec.
Skills: Python, React, PyTorch, MongoDB, Docker
"""

async def test_pure_conceptual_query():
    print("=" * 60)
    print("TEST 1: Pure Conceptual Query -> 'What is Python?'")
    print("=" * 60)
    
    question = "What is Python?"
    accumulated = []
    
    async for token in answer_generator.stream_answer(question, context=MOCK_RESUME_CONTEXT, provider="groq"):
        accumulated.append(token)
        
    res = "".join(accumulated)
    print(res)
    
    assert "FarmEra" not in res, "Failed: Conceptual question mentioned resume project 'FarmEra'"
    assert "LogPulse" not in res, "Failed: Conceptual question mentioned resume project 'LogPulse'"
    assert "my project" not in res.lower(), "Failed: Conceptual question used first-person 'my project'"
    assert "in my experience" not in res.lower(), "Failed: Conceptual question used 'in my experience'"
    assert "Core Mechanics & Architecture" in res or "•" in res, "Missing structured bullet breakdown"
    print("\n✅ TEST 1 PASSED: Pure technical query produced objective industry explanation without personal resume injection!\n")

async def test_personal_experience_query():
    print("=" * 60)
    print("TEST 2: Personal / Experience Query -> 'Tell me about yourself'")
    print("=" * 60)
    
    question = "Tell me about yourself"
    accumulated = []
    
    async for token in answer_generator.stream_answer(question, context=MOCK_RESUME_CONTEXT, provider="groq"):
        accumulated.append(token)
        
    res = "".join(accumulated)
    print(res)
    
    assert "FarmEra" in res or "LogPulse" in res or "Python" in res, "Failed: Personal question did not ground in resume"
    print("\n✅ TEST 2 PASSED: Personal query correctly grounded in candidate resume profile!\n")

async def main():
    await test_pure_conceptual_query()
    await test_personal_experience_query()

if __name__ == "__main__":
    asyncio.run(main())
