import json
import logging
import re
import time
from typing import List, Dict, Any, Optional

logger = logging.getLogger("parakeet-state-manager")


class CodeSessionContext:
    """
    Maintains active short-term code context from screen analysis and coding solutions.
    Stores problem description, generated code, language, and full solution text for multi-turn follow-ups.
    """

    def __init__(self):
        self.active_problem_text: str = ""
        self.active_solution_code: str = ""
        self.last_generated_solution: str = ""
        self.active_language: str = "python"
        self.timestamp: float = 0.0

    def set_active_code(self, problem: str, solution: str, language: str = "python"):
        self.active_problem_text = problem.strip() if problem else ""
        self.last_generated_solution = solution.strip() if solution else ""
        self.timestamp = time.time()

        # Extract code block and language if present
        code_match = re.search(r"```(\w+)?\n([\s\S]*?)```", self.last_generated_solution)
        if code_match:
            if code_match.group(1):
                self.active_language = code_match.group(1).lower()
            elif language:
                self.active_language = language
            self.active_solution_code = code_match.group(2).strip()
        elif not self.active_solution_code:
            self.active_solution_code = self.last_generated_solution

        logger.info(
            f"CodeSessionContext updated -> Problem: '{self.active_problem_text[:50]}', "
            f"Code len: {len(self.active_solution_code)} chars, Lang: {self.active_language}"
        )

    def get_active_code(self) -> str:
        """Returns the full active code context including problem, code, and solution text."""
        if not self.last_generated_solution and not self.active_solution_code:
            return ""

        parts = []
        if self.active_problem_text:
            parts.append(f"Problem: {self.active_problem_text}")
        if self.active_solution_code:
            parts.append(f"Code ({self.active_language}):\n```{self.active_language}\n{self.active_solution_code}\n```")
        elif self.last_generated_solution:
            parts.append(f"Solution:\n{self.last_generated_solution}")
        return "\n\n".join(parts)

    def get_raw_solution(self) -> str:
        return self.last_generated_solution

    @property
    def language(self) -> str:
        return self.active_language

    @language.setter
    def language(self, val: str):
        self.active_language = val

    def has_active_code(self) -> bool:
        return bool(self.active_solution_code or self.last_generated_solution)

    def clear(self):
        self.active_problem_text = ""
        self.active_solution_code = ""
        self.last_generated_solution = ""
        self.active_language = "python"
        self.timestamp = 0.0
        logger.info("CodeSessionContext cleared.")

    def get_summary(self) -> Dict[str, Any]:
        return {
            "has_active_code": self.has_active_code(),
            "problem_title": self.active_problem_text or "No active problem",
            "language": self.active_language,
            "code_preview": self.active_solution_code[:120] if self.active_solution_code else "",
            "timestamp": self.timestamp,
        }


active_code_context = CodeSessionContext()



class ActiveSessionContext:
    """
    Maintains the active problem, code, and conversational context across multi-turn Q&A.
    Locks follow-up questions (pseudocode, dry runs, line-by-line explanation) strictly onto the
    currently active on-screen solution without context drift.
    """

    def __init__(self):
        self.last_question: str = ""
        self.last_problem_title: str = ""
        self.last_intuition: str = ""
        self.last_algorithm: str = ""
        self.last_code_solution: str = ""
        self.last_language: str = "python"
        self.last_time_complexity: str = ""
        self.last_space_complexity: str = ""
        self.last_full_answer: str = ""
        self.history: List[Dict[str, str]] = []  # rolling conversational memory [{role, content}]

    def update_from_answer(self, question: str, full_answer: str):
        """
        Extracts structured fields from generated LLM answers (verbal or coding)
        to ground subsequent follow-up requests.
        """
        if not full_answer:
            return

        self.last_question = question.strip() if question else ""
        self.last_full_answer = full_answer.strip()

        # 1. Extract Question Title if present in format 💬 Summarized question: ...
        q_match = re.search(r"💬\s*Summarized question:\s*([^\n]+)", full_answer, re.IGNORECASE)
        if q_match:
            self.last_problem_title = q_match.group(1).strip()
        elif question and not self.last_problem_title:
            self.last_problem_title = question.strip()

        # 2. Extract Code Block
        code_match = re.search(r"```(\w+)?\n([\s\S]*?)```", full_answer)
        if code_match:
            if code_match.group(1):
                self.last_language = code_match.group(1).lower()
            self.last_code_solution = code_match.group(2).strip()

        # 3. Extract Intuition
        intuition_match = re.search(
            r"Intuition:\s*([\s\S]*?)(?=Algorithm:|Implementation|Complexity|⭐|\Z)",
            full_answer,
            re.IGNORECASE
        )
        if intuition_match:
            self.last_intuition = intuition_match.group(1).strip()

        # 4. Extract Algorithm
        algo_match = re.search(
            r"Algorithm:\s*([\s\S]*?)(?=Implementation|Complexity|```|⭐|\Z)",
            full_answer,
            re.IGNORECASE
        )
        if algo_match:
            self.last_algorithm = algo_match.group(1).strip()

        # 5. Extract Complexity
        time_match = re.search(r"Time Complexity:\s*([^\n]+)", full_answer, re.IGNORECASE)
        if time_match:
            self.last_time_complexity = time_match.group(1).strip()

        space_match = re.search(r"Space Complexity:\s*([^\n]+)", full_answer, re.IGNORECASE)
        if space_match:
            self.last_space_complexity = space_match.group(1).strip()

        # 6. Append to rolling conversational history (capped at 10 items)
        if question:
            self.history.append({"role": "user", "content": question})
        self.history.append({"role": "assistant", "content": full_answer})
        if len(self.history) > 10:
            self.history = self.history[-10:]

        logger.info(
            f"Updated ActiveSessionContext -> Problem: '{self.last_problem_title[:40]}', "
            f"Code present: {bool(self.last_code_solution)}, Lang: {self.last_language}"
        )

    def update_from_vision_solution(self, solution_data: Dict[str, Any]):
        """
        Updates context directly from the structured Gemini Vision solve payload.
        """
        sol_text = ""
        if isinstance(solution_data, dict):
            sol_text = solution_data.get("solution_text") or solution_data.get("solution") or ""
            if isinstance(sol_text, dict):
                sol_text = json.dumps(sol_text)
            
            problem_summary = solution_data.get("problem_summary") or "On-Screen Technical Challenge"
            self.last_problem_title = problem_summary
            self.last_question = problem_summary
            
            if solution_data.get("code_solution"):
                self.last_code_solution = solution_data["code_solution"]
            if solution_data.get("language"):
                self.last_language = solution_data["language"]
            if solution_data.get("time_complexity"):
                self.last_time_complexity = solution_data["time_complexity"]
            if solution_data.get("space_complexity"):
                self.last_space_complexity = solution_data["space_complexity"]
            if solution_data.get("optimal_approach"):
                approach = solution_data["optimal_approach"]
                if isinstance(approach, list):
                    self.last_algorithm = "\n".join(approach)
                else:
                    self.last_algorithm = str(approach)

        if sol_text:
            self.update_from_answer(self.last_problem_title or "On-Screen Technical Challenge", sol_text)

    def clear(self):
        """Resets active context when session is cleared or restarted."""
        self.last_question = ""
        self.last_problem_title = ""
        self.last_intuition = ""
        self.last_algorithm = ""
        self.last_code_solution = ""
        self.last_language = "python"
        self.last_time_complexity = ""
        self.last_space_complexity = ""
        self.last_full_answer = ""
        self.history.clear()
        logger.info("ActiveSessionContext cleared.")

    def get_context_summary(self) -> Dict[str, Any]:
        return {
            "has_active_problem": bool(self.last_problem_title or self.last_code_solution or self.last_question),
            "problem_title": self.last_problem_title or self.last_question or "No active problem",
            "intuition": self.last_intuition,
            "algorithm": self.last_algorithm,
            "code_solution": self.last_code_solution,
            "language": self.last_language,
            "time_complexity": self.last_time_complexity,
            "space_complexity": self.last_space_complexity,
            "history_turns": len(self.history) // 2,
        }


# Global singleton
active_session_context = ActiveSessionContext()
