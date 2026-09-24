import logging
from typing import List, Dict, Any, Optional

from rag.context_manager import context_manager

logger = logging.getLogger("parakeet-rag")


def is_intro_or_background_query(query: str) -> bool:
    """Detect if query is asking for personal/resume introduction or general background."""
    if not query:
        return False
    q_low = query.lower().strip()
    intro_keywords = [
        "tell me about yourself",
        "introduce yourself",
        "walk me through your resume",
        "walk me through your background",
        "who are you",
        "what is your background",
        "describe your background",
        "tell us about yourself",
        "your experience",
        "about yourself",
        "give me an overview of your background",
        "summary of your background",
    ]
    return any(k in q_low for k in intro_keywords)


def retrieve_raw_chunks(
    query: str,
    active_resume_id: Optional[str] = None,
    top_k: int = 3
) -> List[Dict[str, Any]]:
    """
    Retrieve candidate chunks strictly filtered by active_resume_id with similarity scores.
    Chunks from other resumes are completely ignored.
    """
    if not query or not query.strip():
        return []

    target_resume_id = active_resume_id if active_resume_id is not None else context_manager.active_resume_id
    matches = context_manager.vector_store.search(
        query=query.strip(),
        active_resume_id=target_resume_id,
        top_k=top_k
    )

    results = []
    for record, score in matches:
        results.append({
            "id": record.get("id"),
            "resume_id": record.get("resume_id"),
            "doc_id": record.get("doc_id"),
            "doc_type": record.get("doc_type"),
            "text": record.get("text", ""),
            "score": round(score, 4),
        })
    return results


def retrieve_relevant_chunks(
    query: str,
    active_resume_id: Optional[str] = None,
    top_k: int = 3
) -> str:
    """
    Filter candidate chunks strictly by active_resume_id before performing cosine similarity ranking.
    - If active_resume_id is specified: evaluates only chunks tagged with that resume_id.
    - If intro/background query and resume is active: provides complete candidate resume profile.
    - If no resume is active: returns general knowledge or 'No resume provided'.
    - Blends in target Job Description if present.
    """
    clean_query = query.strip() if query else ""
    target_resume_id = active_resume_id if active_resume_id is not None else context_manager.active_resume_id

    # If it's an introduction or background question, provide full resume profile
    if is_intro_or_background_query(clean_query):
        if target_resume_id and target_resume_id in context_manager.resumes:
            res_obj = context_manager.resumes[target_resume_id]
            res_name = res_obj.get("name", target_resume_id)
            raw_text = res_obj.get("raw_text", "").strip()
            if not raw_text:
                raw_text = "\n\n".join(res_obj.get("chunks", []))

            context_blocks = [
                f"--- CANDIDATE RESUME PROFILE ({res_name}) ---",
                raw_text
            ]
            if context_manager.job_description:
                context_blocks.append("\n--- TARGET ROLE / JOB REQUIREMENTS ---")
                context_blocks.append(context_manager.job_description[:600])
            return "\n".join(context_blocks)
        else:
            return "No resume provided"

    # For standard questions: search partitioned vector store
    matched_records = context_manager.vector_store.search(
        query=clean_query,
        active_resume_id=target_resume_id,
        top_k=top_k
    )

    context_blocks = []

    # 1. Format top matching resume/doc experience chunks
    matched_chunks = [record["text"] for record, score in matched_records if record.get("text", "").strip()]
    if matched_chunks:
        header = "--- CANDIDATE RESUME EXPERIENCE & DOCUMENT METRICS ---"
        if target_resume_id and target_resume_id in context_manager.resumes:
            res_name = context_manager.resumes[target_resume_id].get("name", target_resume_id)
            header = f"--- CANDIDATE RESUME ({res_name}) & RELEVANT EXPERIENCE ---"

        context_blocks.append(header)
        for i, r_text in enumerate(matched_chunks, 1):
            context_blocks.append(f"[{i}] {r_text}")

    # 2. Extract key Job Description requirements if present
    if context_manager.job_description:
        jd_snippet = context_manager.job_description[:600]
        context_blocks.append("\n--- TARGET ROLE / JOB REQUIREMENTS ---")
        context_blocks.append(jd_snippet)

    return "\n".join(context_blocks)
