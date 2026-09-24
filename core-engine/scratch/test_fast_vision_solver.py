import os
import sys
from dotenv import load_dotenv

# Set UTF-8 encoding for console output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
load_dotenv(env_path, override=True)
load_dotenv(override=True)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import json
import time

from llm.generator import answer_generator
answer_generator._init_clients()

SAMPLE_OCR_TEXT = """
LeetCode 1. Two Sum
Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.
You may assume that each input would have exactly one solution, and you may not use the same element twice.
You can return the answer in any order.

Example 1:
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].

Constraints:
2 <= nums.length <= 10^4
-10^9 <= nums[i] <= 10^9
-10^9 <= target <= 10^9
Only one valid answer exists.

Follow-up: Can you come up with an algorithm that is less than O(n^2) time complexity?
"""

async def test_direct_fast_solver():
    print("Testing answer_generator.stream_coding_solution with Groq...")
    start_time = time.time()
    first_token_time = None
    accumulated_text = []

    def on_first():
        nonlocal first_token_time
        first_token_time = time.time() - start_time
        print(f"First Token Received in: {first_token_time * 1000:.1f}ms")

    async for token in answer_generator.stream_coding_solution(
        extracted_text=SAMPLE_OCR_TEXT,
        language_hint="python",
        provider="groq",
        on_first_token=on_first
    ):
        accumulated_text.append(token)

    total_time = time.time() - start_time
    full_solution = "".join(accumulated_text)
    print(f"\nTotal Streaming Time: {total_time * 1000:.1f}ms")
    print(f"\n--- Output Solution ({len(full_solution)} chars) ---\n")
    print(full_solution)
    
    assert "Problem" in full_solution or "Two Sum" in full_solution, "Missing problem title"
    assert "```" in full_solution, "Missing markdown code block"
    print("\n✅ Fast Screen Solver Direct Test PASSED successfully!")

if __name__ == "__main__":
    asyncio.run(test_direct_fast_solver())
