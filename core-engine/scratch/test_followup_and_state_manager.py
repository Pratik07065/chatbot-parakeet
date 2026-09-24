import asyncio
import io
import os
import sys

# Ensure UTF-8 stdout
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Ensure core-engine is on sys.path
sys.path.insert(0, r"c:\Users\prati\Desktop\new\core-engine")

from llm.state_manager import ActiveSessionContext, active_session_context
from llm.generator import answer_generator, MultiModelAnswerGenerator


async def test_state_manager_and_followups():
    print("=== 1. Testing ActiveSessionContext ===")
    ctx = ActiveSessionContext()

    # Simulate Screen Solve for Two Sum
    sample_vision_solution = {
        "problem_summary": "Two Sum: Find indices of two numbers that add up to target.",
        "solution_text": (
            "💬 Summarized question: How do you solve Two Sum?\n\n"
            "⭐ Answer:\n"
            "Intuition:\n"
            "Use a hash map to look up the complement `target - num` in O(1) time.\n\n"
            "Algorithm:\n"
            "1. Iterate through `nums` with index `i`.\n"
            "2. If `target - nums[i]` is in map, return indices.\n"
            "3. Else store `nums[i]` with index `i`.\n\n"
            "Implementation (Python):\n"
            "```python\n"
            "class Solution:\n"
            "    def twoSum(self, nums: list[int], target: int) -> list[int]:\n"
            "        seen = {}\n"
            "        for i, num in enumerate(nums):\n"
            "            diff = target - num\n"
            "            if diff in seen:\n"
            "                return [seen[diff], i]\n"
            "            seen[num] = i\n"
            "        return []\n"
            "```\n\n"
            "Complexity Analysis:\n"
            "Time Complexity: O(n)\n"
            "Space Complexity: O(n)"
        ),
        "code_solution": (
            "class Solution:\n"
            "    def twoSum(self, nums: list[int], target: int) -> list[int]:\n"
            "        seen = {}\n"
            "        for i, num in enumerate(nums):\n"
            "            diff = target - num\n"
            "            if diff in seen:\n"
            "                return [seen[diff], i]\n"
            "            seen[num] = i\n"
            "        return []"
        ),
        "language": "python",
        "time_complexity": "O(n)",
        "space_complexity": "O(n)"
    }

    ctx.update_from_vision_solution(sample_vision_solution)
    summary = ctx.get_context_summary()

    print(f"Stored Problem: {summary['problem_title']}")
    print(f"Code present: {bool(summary['code_solution'])}")
    print(f"Language: {summary['language']}")
    assert "Two Sum" in summary["problem_title"]
    assert "seen" in summary["code_solution"]
    assert summary["language"] == "python"
    print("[ACTIVE CONTEXT PASSED]")

    print("\n=== 2. Testing Follow-up: Pseudocode Generation ===")
    pseudocode_chunks = []
    async for token in answer_generator.stream_followup_answer(
        user_query="Write clean step-by-step pseudocode for this solution",
        ctx=ctx,
        provider="groq"
    ):
        pseudocode_chunks.append(token)
    
    full_pseudocode = "".join(pseudocode_chunks)
    print(f"Pseudocode output preview:\n{full_pseudocode[:200]}...")
    assert "Pseudocode" in full_pseudocode or "FUNCTION" in full_pseudocode or "FOR" in full_pseudocode
    print("[PSEUDOCODE FOLLOW-UP PASSED]")

    print("\n=== 3. Testing Follow-up: Dry Run Generation ===")
    dry_run_chunks = []
    async for token in answer_generator.stream_followup_answer(
        user_query="Perform a dry run on this code with nums=[2, 7, 11, 15], target=9",
        ctx=ctx,
        provider="groq"
    ):
        dry_run_chunks.append(token)
    
    full_dry_run = "".join(dry_run_chunks)
    print(f"Dry Run output preview:\n{full_dry_run[:200]}...")
    assert "💬" in full_dry_run or "⭐" in full_dry_run or "Answer" in full_dry_run or "diff" in full_dry_run
    print("[DRY RUN FOLLOW-UP PASSED]")

    print("\n=== 4. Testing Context Reset ===")
    ctx.clear()
    cleared_summary = ctx.get_context_summary()
    assert not cleared_summary["has_active_problem"]
    assert cleared_summary["code_solution"] == ""
    print("[CONTEXT RESET PASSED]")

    print("\n>>> ALL MULTI-TURN FOLLOW-UP & STATE TESTS COMPLETED SUCCESSFULLY! <<<")


if __name__ == "__main__":
    asyncio.run(test_state_manager_and_followups())
