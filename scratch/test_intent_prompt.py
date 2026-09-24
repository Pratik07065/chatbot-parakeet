import asyncio
import sys
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add core-engine to path
sys.path.insert(0, os.path.abspath("core-engine"))

from llm.generator import answer_generator, DYNAMIC_COPILOT_SYSTEM_PROMPT

async def test_generator_intents():
    print("Testing DYNAMIC_COPILOT_SYSTEM_PROMPT intent classification...\n")
    
    # 1. Definitional Question: "What is Python?"
    print("--- 1. Testing Definitional Question: 'What is Python?' ---")
    tokens = []
    async for token in answer_generator.stream_answer(question="What is Python?", context="Candidate has 5 years DevOps at Netflix and scaled Kubernetes to 500k nodes"):
        tokens.append(token)
    def_answer = "".join(tokens)
    print(def_answer.encode('ascii', errors='replace').decode('ascii'))
    
    assert "High-level" in def_answer or "interpreted" in def_answer or "Python" in def_answer
    assert "Netflix" not in def_answer, "Error: Leaked resume context into simple conceptual definition!"
    print(">>> Definitional question test PASSED!\n")

    # 2. Behavioral Question: "Tell me about yourself"
    print("--- 2. Testing Behavioral Question: 'Tell me about yourself' ---")
    tokens = []
    async for token in answer_generator.stream_answer(question="Tell me about yourself", context="Candidate has 5 years DevOps at Netflix"):
        tokens.append(token)
    beh_answer = "".join(tokens)
    print(beh_answer.encode('ascii', errors='replace').decode('ascii'))
    assert "Full-Stack" in beh_answer or "Systems Engineer" in beh_answer or "Netflix" in beh_answer or "experience" in beh_answer.lower()
    print(">>> Behavioral question test PASSED!\n")

    # 3. System Design Question: "How would you design a rate limiter?"
    print("--- 3. Testing System Design Question: 'How would you design a rate limiter?' ---")
    tokens = []
    async for token in answer_generator.stream_answer(question="How would you design a rate limiter?", context=""):
        tokens.append(token)
    sys_answer = "".join(tokens)
    print(sys_answer.encode('ascii', errors='replace').decode('ascii'))
    assert "rate limiter" in sys_answer.lower() or "token bucket" in sys_answer.lower() or "redis" in sys_answer.lower()
    print(">>> System design question test PASSED!\n")

if __name__ == "__main__":
    asyncio.run(test_generator_intents())
    print("ALL INTENT CLASSIFICATION TESTS PASSED SUCCESSFULLY!")
