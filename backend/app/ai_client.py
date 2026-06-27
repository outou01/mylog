"""Unified AI client — tries Gemini first, then OpenAI, then returns None."""
import json
from app.config import settings


def chat(prompt: str, temperature: float = 0.7) -> str | None:
    """Send prompt and return text response. Returns None if no API is configured."""
    if settings.gemini_api_key:
        return _gemini(prompt, temperature)
    if settings.openai_api_key:
        return _openai(prompt, temperature)
    return None


def _gemini(prompt: str, temperature: float) -> str:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(
        settings.gemini_model,
        generation_config={"temperature": temperature},
    )
    response = model.generate_content(prompt)
    return response.text


def _openai(prompt: str, temperature: float) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


def parse_json(text: str) -> dict:
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(text)
