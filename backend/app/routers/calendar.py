from datetime import date, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DailyLog

router = APIRouter(prefix="/calendar", tags=["calendar"])


class DayCell(BaseModel):
    date: str
    mood_score: int | None = None
    energy_level: int | None = None
    sleep_hours: float | None = None
    did_workout: bool = False
    did_create: bool = False
    victory_achieved: bool = False
    has_log: bool = False


class WeekStats(BaseModel):
    week_start: str
    week_end: str
    log_count: int
    avg_sleep: float
    avg_mood: float
    avg_energy: float
    workout_days: int
    create_days: int
    recovery_days: int
    alcohol_days: int


class WeekCompare(BaseModel):
    this_week: WeekStats
    last_week: WeekStats
    aria_comment: str


@router.get("/month", response_model=list[DayCell])
def get_month_calendar(year: int | None = None, month: int | None = None, db: Session = Depends(get_db)):
    today = date.today()
    y = year or today.year
    m = month or today.month

    from calendar import monthrange
    first_day = date(y, m, 1)
    last_day = date(y, m, monthrange(y, m)[1])

    logs = (
        db.query(DailyLog)
        .filter(DailyLog.date >= first_day, DailyLog.date <= last_day)
        .all()
    )
    log_map = {l.date: l for l in logs}

    cells = []
    d = first_day
    while d <= last_day:
        log = log_map.get(d)
        recovery_flags = ["went_outside", "ate_good_food", "took_walk", "visited_cafe",
                          "visited_akihabara", "napped", "played_games", "talked_with_friends", "did_nothing"]
        has_recovery = log and any(getattr(log, f, False) for f in recovery_flags)
        cells.append(DayCell(
            date=d.isoformat(),
            mood_score=log.mood_score if log else None,
            energy_level=log.energy_level if log else None,
            sleep_hours=log.sleep_hours if log else None,
            did_workout=log.did_workout if log else False,
            did_create=log.did_create if log else False,
            victory_achieved=log.victory_achieved if log else False,
            has_log=log is not None,
        ))
        d += timedelta(days=1)
    return cells


def _calc_week_stats(logs: list, week_start: date, week_end: date) -> WeekStats:
    n = len(logs)
    recovery_flags = ["went_outside", "ate_good_food", "took_walk", "visited_cafe",
                      "visited_akihabara", "napped", "played_games", "talked_with_friends", "did_nothing"]
    return WeekStats(
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        log_count=n,
        avg_sleep=round(sum(l.sleep_hours for l in logs) / n, 1) if n else 0,
        avg_mood=round(sum(l.mood_score for l in logs) / n, 1) if n else 0,
        avg_energy=round(sum(getattr(l, "energy_level", 2) for l in logs) / n, 1) if n else 0,
        workout_days=sum(1 for l in logs if l.did_workout),
        create_days=sum(1 for l in logs if l.did_create),
        recovery_days=sum(1 for l in logs if any(getattr(l, f, False) for f in recovery_flags)),
        alcohol_days=sum(1 for l in logs if l.drank_alcohol),
    )


def _aria_compare(this: WeekStats, last: WeekStats) -> str:
    from app.ai_client import chat

    prompt = f"""あなたは「アリア」です。ご主人様の今週と先週の生活ログを比較して、変化や改善点を教えてください。

【今週】
- 記録日数: {this.log_count}日
- 平均睡眠: {this.avg_sleep}時間
- 平均気分: {this.avg_mood}/5
- 平均エネルギー: {this.avg_energy}/3
- 筋トレ: {this.workout_days}日
- 創作: {this.create_days}日
- 回復活動: {this.recovery_days}日
- 飲酒: {this.alcohol_days}日

【先週】
- 記録日数: {last.log_count}日
- 平均睡眠: {last.avg_sleep}時間
- 平均気分: {last.avg_mood}/5
- 平均エネルギー: {last.avg_energy}/3
- 筋トレ: {last.workout_days}日
- 創作: {last.create_days}日
- 回復活動: {last.recovery_days}日
- 飲酒: {last.alcohol_days}日

具体的な数値の差に触れながら、改善した点・悪化した点・注目すべき変化を「アリア」として3文以内で話しかけてください。「ご主人様」と呼んでください。日本語で。"""

    raw = chat(prompt, temperature=0.7)
    if raw is None:
        return _fallback_compare(this, last)
    return raw.strip()


def _fallback_compare(this: WeekStats, last: WeekStats) -> str:
    parts = []
    sleep_diff = round(this.avg_sleep - last.avg_sleep, 1)
    if sleep_diff > 0:
        parts.append(f"睡眠が先週より{sleep_diff}時間増えました、ご主人様！")
    elif sleep_diff < 0:
        parts.append(f"睡眠が先週より{abs(sleep_diff)}時間減っています、ご主人様。")

    mood_diff = round(this.avg_mood - last.avg_mood, 1)
    if mood_diff > 0:
        parts.append(f"気分スコアが{mood_diff}ポイント上がっています！")
    elif mood_diff < 0:
        parts.append(f"気分スコアが{abs(mood_diff)}ポイント下がっています。無理していませんか？")

    workout_diff = this.workout_days - last.workout_days
    if workout_diff > 0:
        parts.append(f"筋トレが{workout_diff}日増えました！")

    if not parts:
        parts.append("今週も先週と同じペースで頑張れています、ご主人様！")

    return " ".join(parts)


@router.get("/compare", response_model=WeekCompare)
def get_week_compare(db: Session = Depends(get_db)):
    today = date.today()
    this_start = today - timedelta(days=today.weekday())
    this_end = this_start + timedelta(days=6)
    last_start = this_start - timedelta(days=7)
    last_end = this_start - timedelta(days=1)

    this_logs = db.query(DailyLog).filter(DailyLog.date >= this_start, DailyLog.date <= this_end).all()
    last_logs = db.query(DailyLog).filter(DailyLog.date >= last_start, DailyLog.date <= last_end).all()

    this_stats = _calc_week_stats(this_logs, this_start, this_end)
    last_stats = _calc_week_stats(last_logs, last_start, last_end)

    try:
        comment = _aria_compare(this_stats, last_stats)
    except Exception:
        comment = _fallback_compare(this_stats, last_stats)

    return WeekCompare(this_week=this_stats, last_week=last_stats, aria_comment=comment)
