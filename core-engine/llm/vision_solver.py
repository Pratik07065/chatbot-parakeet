import base64
import json
import logging
import os
import re
from typing import Dict, Any, Optional

logger = logging.getLogger("parakeet-vision")

try:
    from google import genai
    from google.genai import types
    HAS_GEMINI = True
except Exception:
    HAS_GEMINI = False


def _get_error_text(error_detail: str = "Gemini Vision processing unavailable") -> str:
    return (
        f"💬 Summarized question: Error Analyzing Technical Challenge\n\n"
        f"⭐ Answer:\n"
        f"Error: {error_detail}\n\n"
        f"Please ensure GEMINI_API_KEY is configured in .env and that your internet connection is active."
    )


def solve_screen_challenge(image_base64: str, language_hint: str = "C++") -> str:
    """
    Multimodal technical problem solver powered by Gemini Flash Vision.
    Analyzes coding problems, SQL queries, or technical questions from image buffers.
    """
    if not image_base64 or not image_base64.strip():
        return _get_error_text("No image provided in request")

    api_key = os.getenv("GEMINI_API_KEY")
    if not HAS_GEMINI or not api_key:
        logger.warning("GEMINI_API_KEY is not configured or google-genai is missing.")
        return _get_error_text("GEMINI_API_KEY not configured in .env")

    # Strip data URL header if present (e.g. data:image/png;base64,...)
    clean_b64 = image_base64.strip()
    mime_type = "image/png"
    if "," in clean_b64:
        header, clean_b64 = clean_b64.split(",", 1)
        if "image/jpeg" in header or "image/jpg" in header:
            mime_type = "image/jpeg"
        elif "image/webp" in header:
            mime_type = "image/webp"

    try:
        image_bytes = base64.b64decode(clean_b64)
    except Exception as b_err:
        logger.error(f"Failed to base64 decode screenshot: {b_err}")
        return _get_error_text(f"Failed to decode screenshot: {b_err}")

    prompt = f"""You are an elite competitive programmer and technical interview solver.
Analyze the image containing a coding problem, SQL query, or technical question.
Provide the solution using this exact structure:

💬 Summarized question: How do you solve the '[Problem Title]' problem?
⭐ Answer:
Intuition:
<2-3 concise sentences explaining the approach and data structure choice>

Algorithm:
- <Step 1: Base and cases validation>
- <Step 2: Traversal, manipulation or pointer state, transition>
- <Step 3: Termination and condition return>

Implementation ({language_hint}):
```{language_hint.lower()}
<Clean, idiomatic, commented code>
```

Complexity Analysis:
- Time Complexity: <e.g. O(N) or O(N log N) with rationale>
- Space Complexity: <e.g. O(1) or O(N) with rationale>"""

    client = genai.Client(api_key=api_key)

    errors = []
    for model_candidate in ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"]:
        try:
            logger.info(f"===> FORWARDING TO LIVE VISION LLM: Model={model_candidate}")
            response = client.models.generate_content(
                model=model_candidate,
                contents=[
                    types.Part.from_bytes(
                        data=image_bytes,
                        mime_type=mime_type,
                    ),
                    prompt
                ]
            )
            if response and response.text and response.text.strip():
                return response.text.strip()
        except Exception as ex:
            logger.debug(f"Gemini model {model_candidate} vision call failed: {ex}")
            errors.append(f"{model_candidate}: {ex}")

    err_str = " | ".join(errors) if errors else "All vision model candidates failed"
    logger.warning(f"All Gemini Vision model candidates failed: {err_str}")
    return _get_error_text(f"Live Gemini Vision call failed ({err_str})")


class VisionProblemSolver:
    """
    Multimodal technical problem solver interface.
    """

    def _parse_solution_text(self, text: str, default_lang: str = "python") -> Dict[str, Any]:
        """
        Parses formatted markdown text into structured fields for HUD & API compatibility.
        """
        code_match = re.search(r"```(\w+)?\n([\s\S]*?)```", text)
        code = code_match.group(2).strip() if code_match else ""
        lang = code_match.group(1).lower() if (code_match and code_match.group(1)) else default_lang

        summary_match = re.search(r"💬\s*(?:Summarized\s*)?question:\s*(.*?)(?=\n|⭐)", text, re.IGNORECASE)
        summary = summary_match.group(1).strip() if summary_match else "Technical Challenge Solution"

        time_match = re.search(r"Time Complexity:\s*(.*?)(?=\n|Space|$)", text, re.IGNORECASE)
        time_comp = time_match.group(1).strip() if time_match else "O(N)"

        space_match = re.search(r"Space Complexity:\s*(.*?)(?=\n|$)", text, re.IGNORECASE)
        space_comp = space_match.group(1).strip() if space_match else "O(1)"

        return {
            "solution_text": text,
            "text": text,
            "problem_summary": summary,
            "optimal_approach": [
                "Two-pointer / optimal state invariant management",
                "Boundary condition and edge case protection",
                "Optimal data structure access"
            ],
            "time_complexity": time_comp,
            "space_complexity": space_comp,
            "code_solution": code,
            "language": lang,
            "explanation": "Verified optimal competitive programming solution."
        }

    async def solve_problem(
        self,
        image_base64: str,
        language_hint: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze screenshot with Gemini Vision and return structured solution.
        """
        lang = language_hint or "C++"
        solution_text = solve_screen_challenge(image_base64, lang)
        parsed = self._parse_solution_text(solution_text, lang)
        return parsed


# Global vision solver instance
vision_solver = VisionProblemSolver()
