import json
from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/quick-log", tags=["quick-log"])


class QuickLogRequest(BaseModel):
    text: str


class QuickLogParsed(BaseModel):
    date: str
    sleep_hours: float
    overtime_hours: float
    mood_score: int
    did_workout: bool
    did_create: bool
    did_code: bool
    drank_alcohol: bool
    memo: str


FALLBACK_DEFAULTS = {
    "sleep_hours": 7.0,
    "overtime_hours": 0.0,
    "mood_score": 3,
    "did_workout": False,
    "did_create": False,
    "did_code": False,
    "drank_alcohol": False,
    "memo": "",
}


def _parse_with_openai(text: str, today: str) -> dict:
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)

    prompt = f"""以下の日本語テキストから生活ログ情報を抽出し、JSONのみを返してください。

テキスト:
{text}

抽出ルール:
- date: 今日の日付 {today}（テキストに別の日付があればそちらを使う）
- sleep_hours: 睡眠時間（float。不明なら7.0）
- overtime_hours: 残業時間（float。不明・なしなら0.0）
- mood_score: 気分スコア1〜5（1=かなり悪い/限界、2=悪い/疲れ、3=普通/まあまあ、4=良い、5=かなり良い。不明なら3）
- did_workout: 筋トレしたか（bool）
- did_create: 創作活動したか（bool。絵・小説・音楽・デザインなど）
- did_code: Web開発・プログラミングしたか（bool）
- drank_alcohol: 飲酒したか（bool）
- memo: テキストの要約（1〜2文、日本語）

JSONのみ返してください（コードブロック不要）:
{{"date":"...","sleep_hours":0.0,"overtime_hours":0.0,"mood_score":3,"did_workout":false,"did_create":false,"did_code":false,"drank_alcohol":false,"memo":"..."}}"""

    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    raw = response.choices[0].message.content or "{}"
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(raw)


def _parse_fallback(text: str, today: str) -> dict:
    """Simple rule-based parser used when OpenAI is not configured."""
    import re

    result = {**FALLBACK_DEFAULTS, "date": today}

    # sleep
    m = re.search(r"(\d+(?:\.\d+)?)\s*時間.*?寝|睡眠\s*(\d+(?:\.\d+)?)", text)
    if m:
        result["sleep_hours"] = float(m.group(1) or m.group(2))

    # overtime
    m = re.search(r"残業\s*(\d+(?:\.\d+)?)\s*時間", text)
    if m:
        result["overtime_hours"] = float(m.group(1))
    if re.search(r"残業\s*なし|定時", text):
        result["overtime_hours"] = 0.0

    # activities
    if re.search(r"筋トレ|トレーニング|ジム", text):
        result["did_workout"] = True
    if re.search(r"創作|小説|絵|イラスト|音楽|デザイン", text):
        result["did_create"] = True
    if re.search(r"Web開発|プログラミング|コード|コーディング|Webサービス|開発", text):
        result["did_code"] = True
    if re.search(r"飲酒|お酒|ビール|飲んだ|晩酌", text):
        result["drank_alcohol"] = True

    # mood
    if re.search(r"限界|最悪|しんどい|きつい|つらい", text):
        result["mood_score"] = 1
    elif re.search(r"疲れ|疲労|メンタル重|だるい|憂鬱", text):
        result["mood_score"] = 2
    elif re.search(r"充実|最高|絶好調|楽しかった|気持ちいい", text):
        result["mood_score"] = 5
    elif re.search(r"良かった|元気|そこそこ|まずまず", text):
        result["mood_score"] = 4

    # memo: use original text truncated
    result["memo"] = text[:100].strip()

    return result


def _sanitize(data: dict, today: str) -> dict:
    """Ensure all required fields exist with valid values."""
    result = {**FALLBACK_DEFAULTS, "date": today, **data}
    result["sleep_hours"] = max(0.0, min(24.0, float(result.get("sleep_hours", 7.0))))
    result["overtime_hours"] = max(0.0, float(result.get("overtime_hours", 0.0)))
    result["mood_score"] = max(1, min(5, int(result.get("mood_score", 3))))
    result["did_workout"] = bool(result.get("did_workout", False))
    result["did_create"] = bool(result.get("did_create", False))
    result["did_code"] = bool(result.get("did_code", False))
    result["drank_alcohol"] = bool(result.get("drank_alcohol", False))
    result["memo"] = str(result.get("memo", ""))
    if not result.get("date"):
        result["date"] = today
    return result


@router.post("/parse", response_model=QuickLogParsed)
def parse_quick_log(payload: QuickLogRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="テキストが空です")

    today = date.today().isoformat()

    try:
        if settings.openai_api_key:
            raw = _parse_with_openai(payload.text, today)
        else:
            raw = _parse_fallback(payload.text, today)
    except Exception:
        raw = _parse_fallback(payload.text, today)

    return _sanitize(raw, today)
