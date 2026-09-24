import asyncio
import json
import logging
import os
import re
import sys
import time
from typing import AsyncGenerator, Optional, Dict, Any, Callable

from llm.state_manager import active_session_context, active_code_context, ActiveSessionContext, CodeSessionContext

logger = logging.getLogger("parakeet-llm")

# Provider SDK imports
try:
    from groq import AsyncGroq
    HAS_GROQ = True
except Exception:
    HAS_GROQ = False

try:
    from openai import AsyncOpenAI
    HAS_OPENAI = True
except Exception:
    HAS_OPENAI = False

try:
    from google import genai
    from google.genai import types as genai_types
    HAS_GEMINI = True
except Exception:
    HAS_GEMINI = False

FOLLOWUP_AWARE_PROMPT = """You are an elite, articulate technical interview copilot speaking directly as the candidate.

CANDIDATE RESUME PROFILE:
\"\"\"
{resume_context}
\"\"\"

ACTIVE SCREEN CODE / PROBLEM CONTEXT:
\"\"\"
{code_context}
\"\"\"

CURRENT QUESTION: "{question}"

INTENT & ROUTING RULES:
1. CODE FOLLOW-UP QUESTIONS:
   - If the question asks about previously generated code, optimization, line-by-line explanation, edge cases, or complexity ("explain this code", "what is the time complexity", "optimize this", "why use this data structure", "dry run with input", "walk me through this code"):
     * Reference the ACTIVE SCREEN CODE / PROBLEM CONTEXT above directly.
     * Do NOT give generic templates; refer explicitly to the variables, loops, data structures, and functions present in the active solution.
     * For complexity inquiries, specify exact operations (e.g., "The outer loop runs N times while the hash map lookup is O(1)...").
     * Format:
       💬 Question: <Clean restatement>
       ⭐ Answer: <Direct, 1-2 sentence architectural summary, complexity verdict, or core insight>
       • Code Analysis: <Specific lines/pointers/data structures walk-through referencing the active code>
       • Optimization / Trade-offs: <Concrete alternative approach, edge cases, or complexity improvement>

2. PERSONAL / RESUME QUESTIONS:
   - Inquiries about candidate background, past projects, resume, career history, or specific personal work ("Tell me about yourself", "Walk me through your background", "What projects did you build?", "Explain your experience with Python").
   - Speak directly in the first person as the candidate ("I am...", "In my recent project...").
   - Ground every single metric, project title, and role strictly in the CANDIDATE RESUME PROFILE above.
   - Never fabricate fake senior roles or unlisted years of experience.
   - If the candidate resume profile above says "No resume provided" or is empty, reply:
     💬 Question: <Distilled question>
     ⭐ Answer: Please attach your resume in the setup dashboard so I can summarize your exact background and projects.
   - Format:
     💬 Question: <Clean restatement>
     ⭐ Answer: <Polished 2-sentence career and identity overview>
     • Core Technical Foundations: <Conversational explanation of languages, tools, and architectures used in your work>
     • Signature Projects & Metrics: <Deep dive into concrete project names from resume, models built, and accuracy/latency metrics achieved>
     • Practical Focus: <Current direction and practical technical areas of focus>

3. PURE CONCEPTUAL QUESTIONS:
   - Inquiries about computer science definitions, tools, algorithms, system design, or theoretical concepts ("Tell me about AI", "What is Python?", "How does Kafka achieve high throughput?", "Explain REST vs gRPC", "What is gradient descent?").
   - Answer with high-level industry engineering authority.
   - CRITICAL RULE: DO NOT mention "my project", "in my experience", or any personal background details. Provide an objective, real-world explanation.
   - Format:
     💬 Question: <Clean restatement>
     ⭐ Answer: <Clear, authoritative 1-2 sentence definition or technical thesis>
     • Core Mechanics & Architecture: <Deep explanation of how the concept or technology actually operates under the hood>
     • Production & System Patterns: <How real-world production systems across industry deploy, optimize, and utilize this technology>
     • Engineering Trade-offs & Considerations: <Latency, memory, complexity limits, failure modes, or operational scalability>

4. NEW CODING / ALGORITHMIC PROBLEM:
   - If a new coding problem is presented, provide the optimal, runnable code block with complexity analysis.
   - Format:
     💬 Question: <Distilled coding problem>
     ⭐ Answer:
     ```<language>
     <Clean, complete, runnable code>
     ```
     • Logic & Approach: <Conversational 2-3 sentence explanation of algorithmic paradigm and invariant state tracking>
     • Complexity & Edge Cases: <Time/space complexity analysis and boundary conditions>

CONSTRAINTS:
- No meta-text announcing category (never say "This is category B"). Jump straight into the specified output format.
- Natural, articulate sentences rather than dry keyword tags.
- Keep the overall response around 180–250 words: long enough to be thoroughly informative and natural, but concise enough to scan quickly on screen during a call.
"""

STRICT_INTENT_COPILOT_PROMPT = FOLLOWUP_AWARE_PROMPT
COPILOT_SYSTEM_PROMPT = FOLLOWUP_AWARE_PROMPT
DYNAMIC_COPILOT_SYSTEM_PROMPT = FOLLOWUP_AWARE_PROMPT
INTRO_GROUNDING_PROMPT = FOLLOWUP_AWARE_PROMPT
STRICT_COPILOT_SYSTEM_PROMPT = FOLLOWUP_AWARE_PROMPT
NATURAL_CONVERSATIONAL_COPILOT_PROMPT = FOLLOWUP_AWARE_PROMPT


PERSONAL_INTENT_KEYWORDS = [
    r"\b(you|your|yourself|u)\b",
    r"\b(experience|background|career|history)\b",
    r"\b(project|projects|built|implemented|developed|portfolio)\b",
    r"\b(resume|cv)\b",
    r"\b(hire|fit for this role|strengths?|weakness(es)?)\b",
    r"\b(tell me about yourself|walk me through|introduce yourself)\b",
    r"\b(have you (ever|worked|used)|what did you do)\b",
]


def is_resume_query(question: str) -> bool:
    """
    Deterministic Query Intent Classifier:
    Decides whether RAG retrieval from candidate resume chunks is required
    BEFORE querying the vector store. Pure conceptual/technical questions
    (e.g., 'What is Python?', 'Explain Kafka', 'REST vs gRPC') return False.
    """
    if not question or not question.strip():
        return False
    q_lower = question.lower().strip()
    for pattern in PERSONAL_INTENT_KEYWORDS:
        if re.search(pattern, q_lower):
            return True
    return False


def is_intro_or_background_question(question: str) -> bool:
    """Detect if question is asking for personal/resume introduction or general background."""
    return is_resume_query(question)


def build_copilot_system_prompt(context: str = "", question: str = "", code_context: str = "") -> str:
    # Upstream Intent Guard: If question is pure conceptual/technical, suppress candidate resume context
    if question and not is_resume_query(question):
        ctx_str = "None (Pure Conceptual / Technical Question - Do NOT reference candidate background)"
    else:
        ctx_str = context.strip() if context and context.strip() else "No resume provided"

    q_str = question.strip() if question and question.strip() else ""
    code_ctx_str = code_context.strip() if code_context and code_context.strip() else "No active code context in memory."
    return FOLLOWUP_AWARE_PROMPT.format(
        resume_context=ctx_str,
        code_context=code_ctx_str,
        question=q_str
    )


SYSTEM_PROMPT = build_copilot_system_prompt()



def build_followup_prompt(user_query: str, ctx: ActiveSessionContext) -> tuple[str, str]:
    """
    Builds context-locked system and user prompts for multi-turn follow-ups,
    guaranteeing zero drift from the on-screen active problem & code.
    """
    prob_title = ctx.last_problem_title or ctx.last_question or "On-Screen Technical Problem"
    intuition = ctx.last_intuition or "Optimal algorithmic strategy solving the constraints."
    algo = ctx.last_algorithm or "1. Direct state tracking and optimal traversal."
    code = ctx.last_code_solution or "# Active solution in memory"
    lang = ctx.last_language or "python"
    time_c = ctx.last_time_complexity or "O(N)"
    space_c = ctx.last_space_complexity or "O(1)"

    system_prompt = f"""You are an elite interview assistant and competitive programming expert speaking as the candidate.
The candidate is asking a direct follow-up question about the technical solution currently displayed on their screen.

ACTIVE PROBLEM CONTEXT:
- Problem: {prob_title}
- Intuition: {intuition}
- Algorithm & Decision Steps:
{algo}
- Active Code Solution ({lang}):
```{lang}
{code}
```
- Complexity: Time: {time_c} | Space: {space_c}

STRICT RULES:
1. STRICT RELEVANCE: Base your explanation, dry run, pseudocode, or response EXCLUSIVELY on the active code and algorithm shown above.
2. DO NOT introduce random algorithms, different programming languages, or unrelated LeetCode problems.
3. If the user asks for pseudocode:
   - Format:
     💬 Question: Pseudocode for {prob_title}
     ⭐ Pseudocode:
     ```text
     <step-by-step clean pseudocode matching the active code logic exactly>
     ```
4. If the user asks for an explanation or dry run:
   - Walk through the exact variables, base cases, data structures, and operations from the active solution.
   - For a dry run: Use a concrete sample input (e.g. `s = "abcabcbb"` or `nums = [2, 7, 11, 15]`) and trace variable states step by step.
   - Format:
     💬 Question: <Concise explanation / dry run target>
     ⭐ Answer:
     - <Explanation bullet with exact variables and pointers>
     - <Key insight / boundary condition>
     - <Complexity or outcome reminder>
5. For any other follow-up:
   - Directly resolve the query in the context of this specific active implementation.
   - Format with 💬 Question: and ⭐ Answer: (maximum 3 punchy bullet points or clean code blocks)."""

    user_prompt = f"Candidate Follow-up Request: \"{user_query.strip()}\"\n\nResolve this follow-up based strictly on the active problem and code:"
    return system_prompt, user_prompt


# Model candidate pools for live inference (with dynamic sampling temperature=0.7)
GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama3-70b-8192",
    "llama-3.1-70b-versatile",
    "groq/compound",
    "qwen/qwen3.6-27b",
]

GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash",
]

OPENAI_MODELS = [
    "gpt-4o-mini",
    "gpt-4o",
]

# Standard dynamic sampling temperature for natural response variation
SAMPLING_TEMPERATURE = 0.7


class MultiModelAnswerGenerator:
    """
    Multi-provider live LLM streaming generator with direct entity definition,
    conversational state locking, and automatic live failover:
    Groq LPU -> Gemini Flash -> OpenAI GPT-4o Mini.
    All responses are 100% streamed from real live LLM provider network calls
    with dynamic temperature=0.7 for natural, non-robotic response variation.
    """

    def __init__(self):
        self.groq_client = None
        self.openai_client = None
        self.gemini_client = None
        self._init_clients()

    def _init_clients(self):
        groq_key = os.getenv("GROQ_API_KEY")
        if HAS_GROQ and groq_key:
            try:
                self.groq_client = AsyncGroq(api_key=groq_key)
            except Exception as e:
                logger.debug(f"Could not init Groq client: {e}")

        openai_key = os.getenv("OPENAI_API_KEY")
        if HAS_OPENAI and openai_key:
            try:
                self.openai_client = AsyncOpenAI(api_key=openai_key)
            except Exception as e:
                logger.debug(f"Could not init OpenAI client: {e}")

        gemini_key = os.getenv("GEMINI_API_KEY")
        if HAS_GEMINI and gemini_key:
            try:
                self.gemini_client = genai.Client(api_key=gemini_key)
            except Exception as e:
                logger.debug(f"Could not init Gemini client: {e}")

    def _build_user_prompt(self, question: str, has_code: bool = False) -> str:
        q_clean = question.strip()
        q_low = q_clean.lower()

        # Check if question is a direct code follow-up
        code_followup_cues = [
            "this code", "the code", "this solution", "the solution", "line by line",
            "time complexity", "space complexity", "complexity", "optimize", "optimization",
            "dry run", "walk through", "edge case", "boundary condition", "why use",
            "data structure", "pseudocode", "explain this", "explain it", "how does this work",
            "handle edge cases", "alternative approach"
        ]
        if has_code and any(cue in q_low for cue in code_followup_cues):
            return f"Interviewer Code Follow-up Question: \"{q_clean}\"\n\nDirectly analyze and explain the ACTIVE SCREEN CODE / PROBLEM CONTEXT provided above (specifying exact variables, operations, logic, and complexity):"

        if re.search(r"\b(write a program|write code|write a function|write script|implement|algorithm|solve this|def\s+\w+|class\s+\w+)\b", q_low) or (re.search(r"\b(code|program|function)\b", q_low) and any(w in q_low for w in ["write", "create", "build", "implement", "generate"])):
            return f"Coding Request: \"{q_clean}\"\n\nWrite clean, runnable code wrapped in markdown code blocks followed by conversational logic and complexity breakdown:"
        if is_intro_or_background_question(q_clean):
            return f"Interviewer Question: \"{q_clean}\"\n\nProvide an articulate, natural first-person conversational answer structured with Core Foundations, Signature Projects & Impact, and Current Focus:"
        return f"Interviewer Question: \"{q_clean}\"\n\nProvide an articulate, natural speaking answer explaining implementation mechanics, practical context, and trade-offs:"

    async def stream_answer(
        self,
        question: str,
        context: str = "",
        provider: str = "groq",
        code_context: Optional[str] = None,
        on_first_token: Optional[Callable[[], None]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream answer tokens strictly from live LLM providers with automatic failover
        and temperature=0.7 for dynamic response variation.
        Guarantees 100% live network generation with zero fake/mock responses or caching.
        """
        if not question or not question.strip():
            return

        provider = (provider or "groq").lower()

        # Inject active code context from memory if not explicitly overridden
        effective_code_context = code_context if code_context is not None else active_code_context.get_active_code()
        has_code = bool(effective_code_context and effective_code_context.strip())

        # Upstream Intent Classification for RAG Context
        is_personal = is_resume_query(question)
        if not is_personal:
            effective_context = ""
            logger.info(f"===> [RAG CLASSIFIER]: Query='{question[:60]}' | Intent=TECHNICAL/CONCEPTUAL -> Bypassing RAG resume context")
        else:
            effective_context = context
            logger.info(f"===> [RAG CLASSIFIER]: Query='{question[:60]}' | Intent=PERSONAL/RESUME -> Injecting RAG resume context")

        system_prompt = build_copilot_system_prompt(effective_context, question, effective_code_context)
        user_prompt = self._build_user_prompt(question, has_code=has_code)
        context_len = len(effective_context) if effective_context else 0
        code_ctx_len = len(effective_code_context) if effective_code_context else 0

        # Context logging & terminal verification
        ctx_preview = effective_context[:300].strip() if effective_context and effective_context.strip() else "[NO RESUME CONTEXT / CONCEPTUAL QUERY]"
        code_preview = effective_code_context[:300].strip() if has_code else "[NO ACTIVE CODE CONTEXT]"
        logger.info(f"LLM Context Payload for provider '{provider}' (ResumeLen={context_len}, CodeLen={code_ctx_len} chars)")
        try:
            print(f"\n[LLM CONTEXT SENT TO {provider.upper()} (ResumeLen={context_len}, CodeLen={code_ctx_len} chars)]:\nResume: {ctx_preview}\nCode: {code_preview}\n", flush=True)
        except Exception:
            safe_text = ctx_preview.encode("ascii", "replace").decode("ascii")
            print(f"\n[LLM CONTEXT SENT TO {provider.upper()} (ResumeLen={context_len}, CodeLen={code_ctx_len} chars)]:\n{safe_text}\n", flush=True)


        # Provider hierarchy for auto-failover
        failover_order = [provider] if provider in ["groq", "gemini", "openai"] else ["groq"]
        for alt in ["groq", "gemini", "openai"]:
            if alt not in failover_order:
                failover_order.append(alt)

        errors_encountered = []

        for current_provider in failover_order:
            # 1. Groq Live LLM Call
            if current_provider == "groq" and HAS_GROQ:
                groq_key = os.getenv("GROQ_API_KEY")
                if groq_key:
                    try:
                        if not self.groq_client:
                            self.groq_client = AsyncGroq(api_key=groq_key)

                        for groq_model in GROQ_MODELS:
                            try:
                                logger.info(
                                    f"===> FORWARDING TO LIVE LLM: Provider=groq | Model={groq_model} | "
                                    f"Temp={SAMPLING_TEMPERATURE} | ContextLen={context_len} | Question='{question[:60]}'"
                                )
                                stream = await self.groq_client.chat.completions.create(
                                    model=groq_model,
                                    messages=[
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user", "content": user_prompt},
                                    ],
                                    temperature=SAMPLING_TEMPERATURE,
                                    max_tokens=750,
                                    stream=True,
                                    timeout=10.0,
                                )
                                first_chunk = True
                                token_count = 0
                                async for chunk in stream:
                                    delta = chunk.choices[0].delta.content
                                    if delta:
                                        if first_chunk:
                                             logger.info(f"===> RECEIVED LIVE TOKEN FROM LLM (Provider=groq, Model={groq_model})")
                                             if on_first_token:
                                                 on_first_token()
                                             first_chunk = False
                                        token_count += 1
                                        yield delta
                                if token_count > 0:
                                    return
                            except Exception as g_err:
                                logger.debug(f"Groq model {groq_model} failed: {g_err}")
                                errors_encountered.append(f"Groq ({groq_model}): {g_err}")
                    except Exception as e:
                        logger.warning(f"Groq client error: {e}. Auto-failing over to next provider.")
                        errors_encountered.append(f"Groq: {e}")
                else:
                    errors_encountered.append("Groq: GROQ_API_KEY not configured")

            # 2. Gemini Live LLM Call
            elif current_provider == "gemini" and HAS_GEMINI:
                gemini_key = os.getenv("GEMINI_API_KEY")
                if gemini_key:
                    try:
                        if not self.gemini_client:
                            self.gemini_client = genai.Client(api_key=gemini_key)

                        for model_cand in GEMINI_MODELS:
                            try:
                                logger.info(
                                    f"===> FORWARDING TO LIVE LLM: Provider=gemini | Model={model_cand} | "
                                    f"Temp={SAMPLING_TEMPERATURE} | ContextLen={context_len} | Question='{question[:60]}'"
                                )
                                config = genai_types.GenerateContentConfig(
                                    temperature=SAMPLING_TEMPERATURE,
                                    max_output_tokens=750,
                                )
                                response = self.gemini_client.models.generate_content_stream(
                                    model=model_cand,
                                    contents=f"{system_prompt}\n\n{user_prompt}",
                                    config=config,
                                )
                                first_chunk = True
                                token_count = 0
                                for chunk in response:
                                    if chunk.text:
                                        if first_chunk:
                                            logger.info(f"===> RECEIVED LIVE TOKEN FROM LLM (Provider=gemini, Model={model_cand})")
                                            if on_first_token:
                                                on_first_token()
                                            first_chunk = False
                                        token_count += 1
                                        yield chunk.text
                                if token_count > 0:
                                    return
                            except Exception as m_ex:
                                logger.debug(f"Gemini {model_cand} failed: {m_ex}")
                                errors_encountered.append(f"Gemini ({model_cand}): {m_ex}")
                    except Exception as e:
                        logger.warning(f"Gemini stream error: {e}. Auto-failing over to next provider.")
                        errors_encountered.append(f"Gemini: {e}")
                else:
                    errors_encountered.append("Gemini: GEMINI_API_KEY not configured")

            # 3. OpenAI Live LLM Call
            elif current_provider == "openai" and HAS_OPENAI:
                openai_key = os.getenv("OPENAI_API_KEY")
                if openai_key:
                    try:
                        if not self.openai_client:
                            self.openai_client = AsyncOpenAI(api_key=openai_key)

                        for model_cand in OPENAI_MODELS:
                            try:
                                logger.info(
                                    f"===> FORWARDING TO LIVE LLM: Provider=openai | Model={model_cand} | "
                                    f"Temp={SAMPLING_TEMPERATURE} | ContextLen={context_len} | Question='{question[:60]}'"
                                )
                                stream = await self.openai_client.chat.completions.create(
                                    model=model_cand,
                                    messages=[
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user", "content": user_prompt},
                                    ],
                                    temperature=SAMPLING_TEMPERATURE,
                                    max_tokens=750,
                                    stream=True,
                                    timeout=10.0,
                                )
                                first_chunk = True
                                token_count = 0
                                async for chunk in stream:
                                    delta = chunk.choices[0].delta.content
                                    if delta:
                                        if first_chunk:
                                            logger.info(f"===> RECEIVED LIVE TOKEN FROM LLM (Provider=openai, Model={model_cand})")
                                            if on_first_token:
                                                on_first_token()
                                            first_chunk = False
                                        token_count += 1
                                        yield delta
                                if token_count > 0:
                                    return
                            except Exception as o_err:
                                logger.debug(f"OpenAI model {model_cand} failed: {o_err}")
                                errors_encountered.append(f"OpenAI ({model_cand}): {o_err}")
                    except Exception as e:
                        logger.warning(f"OpenAI stream error: {e}. Auto-failing over to next provider.")
                        errors_encountered.append(f"OpenAI: {e}")
                else:
                    errors_encountered.append("OpenAI: OPENAI_API_KEY not configured")

        # Explicit failure report (Zero fake / simulated fallback responses)
        err_detail = " | ".join(errors_encountered) if errors_encountered else "No API providers configured"
        err_msg = (
            f"Error: All live LLM providers failed to generate an answer.\n"
            f"Details: {err_detail}\n"
            f"Please verify your GROQ_API_KEY / GEMINI_API_KEY in .env and ensure active internet connection."
        )
        logger.error(f"LLM Generation completely failed for '{question[:40]}': {err_detail}")
        yield err_msg

    async def stream_followup_answer(
        self,
        user_query: str,
        ctx: Optional[ActiveSessionContext] = None,
        provider: str = "groq",
        on_first_token: Optional[Callable[[], None]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream context-locked follow-up answers (pseudocode, code explanation, dry run, or custom question)
        anchored strictly to the active on-screen technical problem and code solution via live LLM with temperature=0.7.
        """
        if not user_query or not user_query.strip():
            return

        active_ctx = ctx or active_session_context
        system_prompt, user_prompt = build_followup_prompt(user_query, active_ctx)
        provider = (provider or "groq").lower()

        logger.info(
            f"Generating live follow-up for query: '{user_query}' locked to problem: "
            f"'{active_ctx.last_problem_title or active_ctx.last_question}' (Temp={SAMPLING_TEMPERATURE})"
        )

        failover_order = [provider] if provider in ["groq", "gemini", "openai"] else ["groq"]
        for alt in ["groq", "gemini", "openai"]:
            if alt not in failover_order:
                failover_order.append(alt)

        errors_encountered = []

        for current_provider in failover_order:
            # 1. Groq Live Follow-up
            if current_provider == "groq" and HAS_GROQ:
                groq_key = os.getenv("GROQ_API_KEY")
                if groq_key:
                    try:
                        if not self.groq_client:
                            self.groq_client = AsyncGroq(api_key=groq_key)

                        for groq_model in GROQ_MODELS:
                            try:
                                logger.info(
                                    f"===> FORWARDING TO LIVE LLM: Provider=groq | Model={groq_model} | "
                                    f"Temp={SAMPLING_TEMPERATURE} | Followup='{user_query[:60]}'"
                                )
                                stream = await self.groq_client.chat.completions.create(
                                    model=groq_model,
                                    messages=[
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user", "content": user_prompt},
                                    ],
                                    temperature=SAMPLING_TEMPERATURE,
                                    max_tokens=450,
                                    stream=True,
                                    timeout=10.0,
                                )
                                first_chunk = True
                                token_count = 0
                                async for chunk in stream:
                                    delta = chunk.choices[0].delta.content
                                    if delta:
                                        if first_chunk:
                                            logger.info(f"===> RECEIVED LIVE TOKEN FROM LLM (Provider=groq, Model={groq_model})")
                                            if on_first_token:
                                                on_first_token()
                                            first_chunk = False
                                        token_count += 1
                                        yield delta
                                if token_count > 0:
                                    return
                            except Exception as g_err:
                                logger.debug(f"Groq followup {groq_model} failed: {g_err}")
                                errors_encountered.append(f"Groq ({groq_model}): {g_err}")
                    except Exception as e:
                        logger.warning(f"Groq followup error: {e}. Failing over.")
                        errors_encountered.append(f"Groq: {e}")
                else:
                    errors_encountered.append("Groq: GROQ_API_KEY not configured")

            # 2. Gemini Live Follow-up
            elif current_provider == "gemini" and HAS_GEMINI:
                gemini_key = os.getenv("GEMINI_API_KEY")
                if gemini_key:
                    try:
                        if not self.gemini_client:
                            self.gemini_client = genai.Client(api_key=gemini_key)

                        for model_cand in GEMINI_MODELS:
                            try:
                                logger.info(
                                    f"===> FORWARDING TO LIVE LLM: Provider=gemini | Model={model_cand} | "
                                    f"Temp={SAMPLING_TEMPERATURE} | Followup='{user_query[:60]}'"
                                )
                                config = genai_types.GenerateContentConfig(
                                    temperature=SAMPLING_TEMPERATURE,
                                    max_output_tokens=450,
                                )
                                response = self.gemini_client.models.generate_content_stream(
                                    model=model_cand,
                                    contents=f"{system_prompt}\n\n{user_prompt}",
                                    config=config,
                                )
                                first_chunk = True
                                token_count = 0
                                for chunk in response:
                                    if chunk.text:
                                        if first_chunk:
                                            logger.info(f"===> RECEIVED LIVE TOKEN FROM LLM (Provider=gemini, Model={model_cand})")
                                            if on_first_token:
                                                on_first_token()
                                            first_chunk = False
                                        token_count += 1
                                        yield chunk.text
                                if token_count > 0:
                                    return
                            except Exception as m_ex:
                                logger.debug(f"Gemini followup {model_cand} failed: {m_ex}")
                                errors_encountered.append(f"Gemini ({model_cand}): {m_ex}")
                    except Exception as e:
                        logger.warning(f"Gemini followup error: {e}. Failing over.")
                        errors_encountered.append(f"Gemini: {e}")
                else:
                    errors_encountered.append("Gemini: GEMINI_API_KEY not configured")

            # 3. OpenAI Live Follow-up
            elif current_provider == "openai" and HAS_OPENAI:
                openai_key = os.getenv("OPENAI_API_KEY")
                if openai_key:
                    try:
                        if not self.openai_client:
                            self.openai_client = AsyncOpenAI(api_key=openai_key)

                        for model_cand in OPENAI_MODELS:
                            try:
                                logger.info(
                                    f"===> FORWARDING TO LIVE LLM: Provider=openai | Model={model_cand} | "
                                    f"Temp={SAMPLING_TEMPERATURE} | Followup='{user_query[:60]}'"
                                )
                                stream = await self.openai_client.chat.completions.create(
                                    model=model_cand,
                                    messages=[
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user", "content": user_prompt},
                                    ],
                                    temperature=SAMPLING_TEMPERATURE,
                                    max_tokens=450,
                                    stream=True,
                                    timeout=10.0,
                                )
                                first_chunk = True
                                token_count = 0
                                async for chunk in stream:
                                    delta = chunk.choices[0].delta.content
                                    if delta:
                                        if first_chunk:
                                            logger.info(f"===> RECEIVED LIVE TOKEN FROM LLM (Provider=openai, Model={model_cand})")
                                            if on_first_token:
                                                on_first_token()
                                            first_chunk = False
                                        token_count += 1
                                        yield delta
                                if token_count > 0:
                                    return
                            except Exception as o_err:
                                logger.debug(f"OpenAI followup {model_cand} failed: {o_err}")
                                errors_encountered.append(f"OpenAI ({model_cand}): {o_err}")
                    except Exception as e:
                        logger.warning(f"OpenAI followup error: {e}. Failing over.")
                        errors_encountered.append(f"OpenAI: {e}")
                else:
                    errors_encountered.append("OpenAI: OPENAI_API_KEY not configured")

        # Explicit failure report (Zero fake / simulated fallback responses)
        err_detail = " | ".join(errors_encountered) if errors_encountered else "No API providers configured"
        err_msg = (
            f"Error: All live LLM providers failed for follow-up query.\n"
            f"Details: {err_detail}\n"
            f"Please verify your GROQ_API_KEY / GEMINI_API_KEY in .env and ensure active internet connection."
        )
        logger.error(f"LLM Followup Generation completely failed: {err_detail}")
        yield err_msg

    async def stream_coding_solution(
        self,
        extracted_text: str,
        language_hint: Optional[str] = None,
        provider: str = "groq",
        on_first_token: Optional[Callable[[], None]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Ultra-fast streaming coding solver (<300ms TTFT via Groq LLaMA 3.3 70B).
        Extracts on-screen coding problem and streams structured solution directly to the UI.
        """
        clean_text = (extracted_text or "").strip()
        if not clean_text:
            yield "No readable text detected on screen. Please ensure the problem is visible."
            return

        system_prompt, user_prompt = build_fast_coding_prompt(clean_text, language_hint)
        provider = (provider or "groq").lower()

        logger.info(
            f"⚡ [Fast Screen Solver] Processing extracted text ({len(clean_text)} chars) with provider={provider} "
            f"(Lang Hint: {language_hint or 'python'})"
        )

        failover_order = [provider] if provider in ["groq", "gemini", "openai"] else ["groq"]
        for alt in ["groq", "gemini", "openai"]:
            if alt not in failover_order:
                failover_order.append(alt)

        errors_encountered = []

        for current_provider in failover_order:
            # 1. Groq High-Speed Live Stream (< 300ms latency)
            if current_provider == "groq" and HAS_GROQ:
                groq_key = os.getenv("GROQ_API_KEY")
                if groq_key:
                    try:
                        if not self.groq_client:
                            self.groq_client = AsyncGroq(api_key=groq_key)

                        for groq_model in GROQ_MODELS:
                            try:
                                logger.info(
                                    f"===> FORWARDING FAST SOLVER TO LIVE LLM: Provider=groq | Model={groq_model} | Temp=0.2"
                                )
                                stream = await self.groq_client.chat.completions.create(
                                    model=groq_model,
                                    messages=[
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user", "content": user_prompt},
                                    ],
                                    temperature=0.2,
                                    max_tokens=650,
                                    stream=True,
                                    timeout=15.0,
                                )
                                first_chunk = True
                                token_count = 0
                                async for chunk in stream:
                                    delta = chunk.choices[0].delta.content
                                    if delta:
                                        if first_chunk:
                                            logger.info(f"===> RECEIVED FIRST TOKEN FROM FAST SOLVER (Provider=groq, Model={groq_model})")
                                            if on_first_token:
                                                on_first_token()
                                            first_chunk = False
                                        token_count += 1
                                        yield delta
                                if token_count > 0:
                                    return
                            except Exception as g_err:
                                logger.debug(f"Groq fast solver {groq_model} failed: {g_err}")
                                errors_encountered.append(f"Groq ({groq_model}): {g_err}")
                    except Exception as e:
                        logger.warning(f"Groq fast solver error: {e}. Failing over.")
                        errors_encountered.append(f"Groq: {e}")
                else:
                    errors_encountered.append("Groq: GROQ_API_KEY not configured")

            # 2. Gemini Live Stream Failover
            elif current_provider == "gemini" and HAS_GEMINI:
                gemini_key = os.getenv("GEMINI_API_KEY")
                if gemini_key:
                    try:
                        if not self.gemini_client:
                            self.gemini_client = genai.Client(api_key=gemini_key)

                        for model_cand in GEMINI_MODELS:
                            try:
                                logger.info(
                                    f"===> FORWARDING FAST SOLVER TO LIVE LLM: Provider=gemini | Model={model_cand} | Temp=0.2"
                                )
                                config = genai_types.GenerateContentConfig(
                                    temperature=0.2,
                                    max_output_tokens=1024,
                                )
                                response = self.gemini_client.models.generate_content_stream(
                                    model=model_cand,
                                    contents=f"{system_prompt}\n\n{user_prompt}",
                                    config=config,
                                )
                                first_chunk = True
                                token_count = 0
                                for chunk in response:
                                    if chunk.text:
                                        if first_chunk:
                                            logger.info(f"===> RECEIVED FIRST TOKEN FROM FAST SOLVER (Provider=gemini, Model={model_cand})")
                                            if on_first_token:
                                                on_first_token()
                                            first_chunk = False
                                        token_count += 1
                                        yield chunk.text
                                if token_count > 0:
                                    return
                            except Exception as m_ex:
                                logger.debug(f"Gemini fast solver {model_cand} failed: {m_ex}")
                                errors_encountered.append(f"Gemini ({model_cand}): {m_ex}")
                    except Exception as e:
                        logger.warning(f"Gemini fast solver error: {e}. Failing over.")
                        errors_encountered.append(f"Gemini: {e}")
                else:
                    errors_encountered.append("Gemini: GEMINI_API_KEY not configured")

            # 3. OpenAI Live Stream Failover
            elif current_provider == "openai" and HAS_OPENAI:
                openai_key = os.getenv("OPENAI_API_KEY")
                if openai_key:
                    try:
                        if not self.openai_client:
                            self.openai_client = AsyncOpenAI(api_key=openai_key)

                        for model_cand in OPENAI_MODELS:
                            try:
                                logger.info(
                                    f"===> FORWARDING FAST SOLVER TO LIVE LLM: Provider=openai | Model={model_cand} | Temp=0.2"
                                )
                                stream = await self.openai_client.chat.completions.create(
                                    model=model_cand,
                                    messages=[
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user", "content": user_prompt},
                                    ],
                                    temperature=0.2,
                                    max_tokens=1024,
                                    stream=True,
                                    timeout=15.0,
                                )
                                first_chunk = True
                                token_count = 0
                                async for chunk in stream:
                                    delta = chunk.choices[0].delta.content
                                    if delta:
                                        if first_chunk:
                                            logger.info(f"===> RECEIVED FIRST TOKEN FROM FAST SOLVER (Provider=openai, Model={model_cand})")
                                            if on_first_token:
                                                on_first_token()
                                            first_chunk = False
                                        token_count += 1
                                        yield delta
                                if token_count > 0:
                                    return
                            except Exception as o_err:
                                logger.debug(f"OpenAI fast solver {model_cand} failed: {o_err}")
                                errors_encountered.append(f"OpenAI ({model_cand}): {o_err}")
                    except Exception as e:
                        logger.warning(f"OpenAI fast solver error: {e}. Failing over.")
                        errors_encountered.append(f"OpenAI: {e}")
                else:
                    errors_encountered.append("OpenAI: OPENAI_API_KEY not configured")

        err_detail = " | ".join(errors_encountered) if errors_encountered else "No API providers configured"
        err_msg = (
            f"Error: All live LLM providers failed for fast screen solve.\n"
            f"Details: {err_detail}\n"
            f"Please verify your GROQ_API_KEY / GEMINI_API_KEY in .env."
        )
        logger.error(f"Fast Screen Solver failed: {err_detail}")
        yield err_msg


FAST_CODING_SYSTEM_PROMPT = """You are an elite, ultra-fast coding copilot assisting a candidate in a live technical interview.
You will be provided with raw OCR text extracted from the candidate's screen (e.g., LeetCode / HackerRank problem description, constraints, and function signatures).

Analyze the text and immediately output the optimal solution using this STRICT format:

💬 Problem: <Identified Problem Title or Concise Summary>
⭐ Answer:
Intuition: <High-yield 2-sentence intuition explaining optimal algorithmic paradigm and state transitions.>
```{language}
<Clean, production-ready, optimal code with clear variable names and edge case handling>
```
Complexity: Time O(<time_complexity>), Space O(<space_complexity>)

RULES:
1. Start directly with "💬 Problem:" followed immediately by "⭐ Answer:".
2. Do NOT output any filler conversational text (no "Here is the solution", "Sure", etc.).
3. Write clean, complete, runnable code in the requested language (default to Python if none is specified).
"""


def build_fast_coding_prompt(extracted_text: str, language_hint: Optional[str] = None) -> tuple[str, str]:
    lang = language_hint if language_hint and language_hint.strip() else "python"
    sys_prompt = FAST_CODING_SYSTEM_PROMPT.replace("{language}", lang.lower())
    user_prompt = (
        f"ON-SCREEN EXTRACTED TEXT:\n\"\"\"\n{extracted_text.strip()}\n\"\"\"\n\n"
        f"Target Language: {lang}\n\n"
        f"Identify the problem and provide the optimal code solution now:"
    )
    return sys_prompt, user_prompt


# Global generator instance
answer_generator = MultiModelAnswerGenerator()
LLMGenerator = MultiModelAnswerGenerator


async def stream_coding_solution(
    extracted_text: str,
    language_hint: Optional[str] = None,
    provider: str = "groq"
) -> AsyncGenerator[str, None]:
    """Convenience wrapper for fast streaming coding solution."""
    async for chunk in answer_generator.stream_coding_solution(
        extracted_text=extracted_text,
        language_hint=language_hint,
        provider=provider
    ):
        yield chunk
