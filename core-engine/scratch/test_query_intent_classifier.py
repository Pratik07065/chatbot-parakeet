import os
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from llm.generator import is_resume_query, build_copilot_system_prompt

CONCEPTUAL_QUERIES = [
    "What is Python?",
    "How does Kafka achieve high throughput?",
    "Explain REST vs gRPC",
    "What is gradient descent?",
    "What are goroutines in Golang?",
    "Difference between TCP and UDP",
    "Explain how B-Trees work in database indexes",
    "Explain ACID properties in relational databases",
    "How does the V8 JavaScript engine work?",
    "What is Docker containerization?",
]

PERSONAL_RESUME_QUERIES = [
    "Tell me about yourself",
    "Walk me through your background",
    "What was your role in your previous project?",
    "Explain your project",
    "Have you worked with Kubernetes?",
    "Why should we hire you?",
    "What are your greatest strengths?",
    "Can you describe your experience with FastAPI?",
    "Tell me about your portfolio",
    "What did you do at your last company?",
    "What is your background in distributed systems?",
    "Have you ever built a machine learning pipeline?",
    "Walk me through your resume",
]

def run_tests():
    print("=== [TEST 1: Upstream Query Intent Classifier Validation] ===")
    
    passed_conceptual = 0
    for q in CONCEPTUAL_QUERIES:
        res = is_resume_query(q)
        status = "PASS" if not res else "FAIL"
        print(f"  [{status}] Conceptual: '{q}' -> is_resume={res} (Expected: False)")
        assert not res, f"Expected False for '{q}', got {res}"
        passed_conceptual += 1

    print(f"\n[OK] {passed_conceptual}/{len(CONCEPTUAL_QUERIES)} conceptual queries correctly classified as False (RAG bypassed)!\n")

    passed_personal = 0
    for q in PERSONAL_RESUME_QUERIES:
        res = is_resume_query(q)
        status = "PASS" if res else "FAIL"
        print(f"  [{status}] Personal: '{q}' -> is_resume={res} (Expected: True)")
        assert res, f"Expected True for '{q}', got {res}"
        passed_personal += 1

    print(f"\n[OK] {passed_personal}/{len(PERSONAL_RESUME_QUERIES)} personal queries correctly classified as True (RAG active)!\n")

    print("=== [TEST 2: Prompt Guard & Contamination Prevention] ===")
    mock_resume = "Alex Chen: Built FarmEra precision agriculture with PyTorch."
    
    # 1. Conceptual question prompt
    prompt_conceptual = build_copilot_system_prompt(context=mock_resume, question="What is Python?")
    assert "FarmEra" not in prompt_conceptual, "Contamination: Resume project leaked into conceptual prompt!"
    assert "Pure Conceptual / Technical Question" in prompt_conceptual, "Missing conceptual prompt marker!"
    print("  [PASS] Conceptual question prompt suppressed candidate resume context.")

    # 2. Personal question prompt
    prompt_personal = build_copilot_system_prompt(context=mock_resume, question="Tell me about your experience")
    assert "FarmEra" in prompt_personal, "Grounding Error: Resume project missing from personal prompt!"
    print("  [PASS] Personal question prompt injected candidate resume context.")

    print("\n=== ALL UPSTREAM QUERY INTENT CLASSIFIER TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    run_tests()
