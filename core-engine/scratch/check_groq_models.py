import os
import sys
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
load_dotenv(env_path, override=True)
load_dotenv(override=True)

import asyncio
from groq import AsyncGroq

async def check_groq_models():
    client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
    models_to_test = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "llama3-70b-8192",
        "llama3-8b-8192",
        "qwen/qwen3.6-27b",
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
        "groq/compound",
        "groq/compound-mini",
        "gemma2-9b-it",
        "mixtral-8x7b-32768"
    ]
    
    print("Testing Groq models...")
    for m in models_to_test:
        try:
            resp = await client.chat.completions.create(
                model=m,
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=50,
            )
            print(f"[SUCCESS] {m}: {resp.choices[0].message.content.strip()[:30]}")
        except Exception as e:
            print(f"[FAIL] {m}: {e}")

if __name__ == "__main__":
    asyncio.run(check_groq_models())
