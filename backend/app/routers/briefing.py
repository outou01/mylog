import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import DailyLog, MonthlyTheme, WeekendNote
from app.routers.weekly_report import _calc_stats

router = APIRouter(prefix="/briefing", tags=["briefing"])


# ── schemas ──────────────────────────────────────────────

class MonthlyThemeUpsert(BaseModel):
    theme_text: str


class MonthlyThemeOut(BaseModel):
    month: str
    theme_text: str


class WeekendNoteUpsert(BaseModel):
    next_action: str


class BriefingOut(BaseModel):
    today: str
    month: str
    theme_text: str | None
    week_start: str
    week_end: str
    workout_days: int
    create_days: int
    code_days: int
    alcohol_days: int
    avg_sleep: float
    avg_mood: float
    last_next_action: str | None
    ai_advice: str
    suggested_action: str


# ── monthly theme ─────────────────────────────────────────

@router.get("/theme", response_model=MonthlyThemeOut | None)
def get_theme(db: Session = Depends(get_db)):
    month = date.today().strftime("%Y-%m")
    row = db.query(MonthlyTheme).filter(MonthlyTheme.month == month).first()
    return row


@router.post("/theme", response_model=MonthlyThemeOut)
def upsert_theme(payload: MonthlyThemeUpsert, db: Session = Depends(get_db)):
    month = date.today().strftime("%Y-%m")
    row = db.query(MonthlyTheme).filter(MonthlyTheme.month == month).first()
    if row:
        row.theme_text = payload.theme_text
    else:
        row = MonthlyTheme(month=month, theme_text=payload.theme_text)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ── weekend note (来週やること保存) ───────────────────────

@router.post("/note", response_model=dict)
def save_weekend_note(payload: WeekendNoteUpsert, db: Session = Depends(get_db)):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    row = db.query(WeekendNote).filter(WeekendNote.week_start == week_start).first()
    if row:
        row.next_action = payload.next_action
    else:
        row = WeekendNote(week_start=week_start, next_action=payload.next_action)
        db.add(row)
    db.commit()
    return {"saved": True, "next_action": payload.next_action}


# ── briefing ─────────────────────────────────────────────

def _ai_advice(stats, theme_text: str | None, last_action: str | None, logs: list) -> tuple[str, str]:
    """Returns (ai_advice, suggested_action)"""
    if not settings.openai_api_key:
        return _fallback_advice(stats, last_action)
    try:
        return _openai_advice(stats, theme_text, last_action, logs)
    except Exception:
        return _fallback_advice(stats, last_action)


def _fallback_advice(stats, last_action: str | None) -> tuple[str, str]:
    parts = []
    if stats.avg_sleep < 6.5:
        parts.append(f"睡眠が{stats.avg_sleep}時間と少なめでした。今週末は休息を優先してください。")
    if stats.create_days < 2:
        parts.append("創作が少なかった週です。今週末30分だけでも手を動かしてみましょう。")
    if stats.alcohol_days > 0:
        parts.append(f"飲酒が{stats.alcohol_days}日ありました。今週末は飲まないと来週が楽になります。")
    if not parts:
        parts.append("今週もよく動けました。今週末は無理せず自分のペースで進みましょう。")

    if stats.create_days < stats.workout_days:
        suggested = "創作に1〜2時間だけ使う"
    elif stats.avg_sleep < 7:
        suggested = "睡眠を整えて体を回復させる"
    else:
        suggested = "転職活動を1つ前進させる"

    return " ".join(parts), suggested


def _openai_advice(stats, theme_text: str | None, last_action: str | None, logs: list) -> tuple[str, str]:
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)

    memo_summary = "\n".join(f"- {l.date}: {l.memo}" for l in logs if l.memo) or "なし"

    prompt = f"""以下は今週の生活ログ集計です。週末ブリーフィングとして、日本語で短く返してください。

【今月のテーマ】
{theme_text or '未設定'}

【今週の実績】
- 平均睡眠: {stats.avg_sleep}時間
- 平均気分: {stats.avg_mood}/5
- 筋トレ: {stats.workout_days}日
- 創作: {stats.create_days}日
- 開発: {stats.code_days}日
- 飲酒: {stats.alcohol_days}日

【メモ】
{memo_summary}

【先週末に決めたやること】
{last_action or 'なし'}

以下のJSONのみ返してください（コードブロック不要）:
{{"ai_advice":"今週を踏まえた一言コメント(2文以内、具体的に)","suggested_action":"今週末やること1つだけ(動詞で始まる短い文)"}}"""

    res = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )
    raw = res.choices[0].message.content or "{}"
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    data = json.loads(raw)
    return data.get("ai_advice", ""), data.get("suggested_action", "")


@router.get("/weekend", response_model=BriefingOut)
def get_weekend_briefing(db: Session = Depends(get_db)):
    today = date.today()
    week_start = today - timedelta(days=6)
    week_end = today
    month = today.strftime("%Y-%m")

    logs = (
        db.query(DailyLog)
        .filter(DailyLog.date >= week_start, DailyLog.date <= week_end)
        .order_by(DailyLog.date.asc())
        .all()
    )
    if not logs:
        raise HTTPException(status_code=404, detail="今週のログがまだありません")

    stats = _calc_stats(logs, week_start, week_end)

    theme_row = db.query(MonthlyTheme).filter(MonthlyTheme.month == month).first()
    theme_text = theme_row.theme_text if theme_row else None

    # 先週のnext_action
    last_week_start = week_start - timedelta(days=7)
    note_row = db.query(WeekendNote).filter(WeekendNote.week_start == last_week_start).first()
    last_next_action = note_row.next_action if note_row else None

    ai_advice, suggested_action = _ai_advice(stats, theme_text, last_next_action, logs)

    return BriefingOut(
        today=today.isoformat(),
        month=month,
        theme_text=theme_text,
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        workout_days=stats.workout_days,
        create_days=stats.create_days,
        code_days=stats.code_days,
        alcohol_days=stats.alcohol_days,
        avg_sleep=stats.avg_sleep,
        avg_mood=stats.avg_mood,
        last_next_action=last_next_action,
        ai_advice=ai_advice,
        suggested_action=suggested_action,
    )
