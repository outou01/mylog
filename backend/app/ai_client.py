"""Unified AI client — tries Gemini first, then OpenAI, then returns None."""
import json
from urllib import error, parse, request

from app.config import settings


def chat(prompt: str, temperature: float = 0.7) -> str | None:
    """Send prompt and return text response. Returns None if no API is configured."""
    if settings.gemini_api_key:
        return _gemini(prompt, temperature)
    if settings.openai_api_key:
        return _openai(prompt, temperature)
    return None


def _gemini(prompt: str, temperature: float) -> str:
    model = parse.quote(settings.gemini_model, safe="")
    query = parse.urlencode({"key": settings.gemini_api_key})
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?{query}"
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "thinkingConfig": {"thinkingLevel": "minimal"},
        },
    }, ensure_ascii=False).encode("utf-8")
    api_request = request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(api_request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini API HTTP {exc.code}: {detail[:500]}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Gemini API connection failed: {exc.reason}") from exc

    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    text = "".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise RuntimeError(f"Gemini API returned no text: {json.dumps(data, ensure_ascii=False)[:500]}")
    return text


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
