import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import DailyLog

router = APIRouter(prefix="/weekly-report", tags=["weekly-report"])


class WeeklyStats(BaseModel):
    week_start: str
    week_end: str
    log_count: int
    avg_sleep: float
    avg_mood: float
    avg_overtime: float
    workout_days: int
    create_days: int
    code_days: int
    alcohol_days: int
    no_alcohol_days: int


class WeeklyReport(BaseModel):
    stats: WeeklyStats
    good_things: str
    progress: str
    next_action: str
    advice: str


def _calc_stats(logs: list[DailyLog], week_start: date, week_end: date) -> WeeklyStats:
    if not logs:
        return WeeklyStats(
            week_start=week_start.isoformat(),
            week_end=week_end.isoformat(),
            log_count=0,
            avg_sleep=0, avg_mood=0, avg_overtime=0,
            workout_days=0, create_days=0, code_days=0,
            alcohol_days=0, no_alcohol_days=0,
        )
    n = len(logs)
    return WeeklyStats(
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        log_count=n,
        avg_sleep=round(sum(l.sleep_hours for l in logs) / n, 1),
        avg_mood=round(sum(l.mood_score for l in logs) / n, 1),
        avg_overtime=round(sum(l.overtime_hours for l in logs) / n, 1),
        workout_days=sum(1 for l in logs if l.did_workout),
        create_days=sum(1 for l in logs if l.did_create),
        code_days=sum(1 for l in logs if l.did_code),
        alcohol_days=sum(1 for l in logs if l.drank_alcohol),
        no_alcohol_days=sum(1 for l in logs if not l.drank_alcohol),
    )


def _generate_report_fallback(stats: WeeklyStats) -> dict:
    good = []
    if stats.workout_days >= 2:
        good.append(f"筋トレ{stats.workout_days}回達成")
    if stats.alcohol_days == 0:
        good.append("飲酒0日をキープ")
    elif stats.no_alcohol_days >= 5:
        good.append(f"飲酒を{stats.alcohol_days}日に抑えた")
    if stats.create_days >= 3:
        good.append(f"創作{stats.create_days}日できた")
    if stats.avg_sleep >= 7:
        good.append(f"睡眠平均{stats.avg_sleep}時間確保できた")
    if not good:
        good.append("今週も記録を続けられた")

    progress = []
    if stats.code_days > 0:
        progress.append(f"Web開発{stats.code_days}日進めた")
    if stats.avg_mood >= 3.5:
        progress.append(f"気分スコア平均{stats.avg_mood}と安定していた")
    if not progress:
        progress.append("ログを記録し自分を振り返る習慣が続いている")

    # next action
    if stats.avg_sleep < 6.5:
        next_action = "睡眠を7時間に戻すことを最優先にする"
    elif stats.workout_days < 2:
        next_action = "筋トレを週2回こなす"
    elif stats.alcohol_days > 2:
        next_action = "飲酒を減らして体調を整える"
    elif stats.create_days < 3:
        next_action = "創作を週3日以上やってみる"
    else:
        next_action = "今週のペースを維持する"

    advice = "完璧を目指さない。続けることが正義。少しずつ前に進んでいます。"

    return {
        "good_things": "、".join(good),
        "progress": "、".join(progress),
        "next_action": next_action,
        "advice": advice,
    }


def _generate_report_openai(stats: WeeklyStats, logs: list[DailyLog]) -> dict:
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)

    memo_summary = "\n".join(
        f"- {l.date}: {l.memo}" for l in logs if l.memo
    ) or "なし"

    prompt = f"""以下は今週（{stats.week_start}〜{stats.week_end}）の生活ログ集計です。日本語で週次レビューを生成してください。

【今週の統計】
- 記録日数: {stats.log_count}日
- 平均睡眠: {stats.avg_sleep}時間
- 平均気分スコア: {stats.avg_mood}/5
- 平均残業: {stats.avg_overtime}時間
- 筋トレ: {stats.workout_days}日
- 創作: {stats.create_days}日
- Web開発: {stats.code_days}日
- 飲酒: {stats.alcohol_days}日 / 禁酒: {stats.no_alcohol_days}日

【メモ抜粋】
{memo_summary}

【この人の習慣目標】
- 睡眠: 23時就寝・6時起床（約7時間）
- 筋トレ: 週2回
- 創作: 週3〜4日
- 酒: 禁止
- 気分: 安定していること

以下のJSONのみ返してください（コードブロック不要）:
{{"good_things":"今週良かったこと(1〜2文)","progress":"今週進んだこと(1文)","next_action":"来週やること1つだけ(1文、具体的に)","advice":"励ましの一言(1文、この人の「完璧を目指さない。続けることが正義」という哲学に合わせて)"}}"""

    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )
    raw = response.choices[0].message.content or "{}"
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(raw)


@router.get("/latest", response_model=WeeklyReport)
def get_latest_weekly_report(db: Session = Depends(get_db)):
    today = date.today()
    # 直近7日間
    week_end = today
    week_start = today - timedelta(days=6)
    return _get_report(week_start, week_end, db)


@router.get("/{week_start}", response_model=WeeklyReport)
def get_weekly_report(week_start: str, db: Session = Depends(get_db)):
    try:
        start = date.fromisoformat(week_start)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    end = start + timedelta(days=6)
    return _get_report(start, end, db)


def _get_report(week_start: date, week_end: date, db: Session) -> WeeklyReport:
    logs = (
        db.query(DailyLog)
        .filter(DailyLog.date >= week_start, DailyLog.date <= week_end)
        .order_by(DailyLog.date.asc())
        .all()
    )

    stats = _calc_stats(logs, week_start, week_end)

    try:
        if settings.openai_api_key and logs:
            data = _generate_report_openai(stats, logs)
        else:
            data = _generate_report_fallback(stats)
    except Exception:
        data = _generate_report_fallback(stats)

    return WeeklyReport(stats=stats, **data)
