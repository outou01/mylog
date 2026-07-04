from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import date, datetime, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DailyLog, ScheduleBlock, ScheduleMessage

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


class ActivityHours(BaseModel):
    create_hours: float
    workout_hours: float
    study_hours: float
    code_hours: float
    job_search_hours: float
    total_advance_hours: float


class WeekHoursCompare(BaseModel):
    this_week: ActivityHours
    last_week: ActivityHours
    week_start: str
    last_week_start: str


class PatternInsight(BaseModel):
    insights: list[str]
    aria_comment: str


class TimeCategoryTotal(BaseModel):
    key: str
    label: str
    color: str
    minutes: int
    hours: float


class TimeAnalysisSection(BaseModel):
    label: str
    start_date: str
    end_date: str
    total_minutes: int
    categories: list[TimeCategoryTotal]


class TimeAnalysisOut(BaseModel):
    selected_date: str
    daily: TimeAnalysisSection
    weekly: TimeAnalysisSection
    monthly: TimeAnalysisSection


class ScheduleBlockOut(BaseModel):
    id: int | None
    date: str
    start_time: str
    end_time: str
    title: str
    category: str
    note: str | None = None
    editable: bool = True


class WeekScheduleOut(BaseModel):
    week_start: str
    week_end: str
    day_start_hour: int
    day_end_hour: int
    schedule_message: str
    blocks: list[ScheduleBlockOut]


class ScheduleBlockPayload(BaseModel):
    date: date
    start_time: str
    end_time: str
    title: str = Field(min_length=1, max_length=120)
    category: str = Field(default="self", max_length=40)
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time(cls, value: str) -> str:
        try:
            datetime.strptime(value, "%H:%M")
        except ValueError as exc:
            raise ValueError("Use HH:MM format") from exc
        return value


def _parse_time(value: str) -> time:
    return datetime.strptime(value, "%H:%M").time()


def _time_str(value: time) -> str:
    return value.strftime("%H:%M")


def _minutes_between(start: time, end: time) -> int:
    start_minutes = start.hour * 60 + start.minute
    end_minutes = end.hour * 60 + end.minute
    return max(0, end_minutes - start_minutes)


def _week_start(target: date) -> date:
    return target - timedelta(days=target.weekday())


TIME_CATEGORIES = [
    {"key": "creation", "label": "創作", "color": "#a970d6"},
    {"key": "workout", "label": "筋トレ", "color": "#f9734a"},
    {"key": "job_search", "label": "転職活動", "color": "#5d9cec"},
    {"key": "social", "label": "交流", "color": "#58b77b"},
]


def _work_blocks(start: date) -> list[ScheduleBlockOut]:
    blocks: list[ScheduleBlockOut] = []
    for offset in range(5):
        day = start + timedelta(days=offset)
        blocks.append(ScheduleBlockOut(
            id=None,
            date=day.isoformat(),
            start_time="09:30",
            end_time="18:30",
            title="仕事",
            category="work",
            note="固定: 平日 9:30-18:30",
            editable=False,
        ))
    return blocks


def _fallback_schedule_message(today: date) -> str:
    messages = [
        "仕事以外の時間は、余りものではなく人生の本体です。今日は小さくても、自分のための枠を先に置きましょう。",
        "予定に入っていない自分時間は、仕事の疲れに溶けやすいです。30分だけでも、先に場所を作りましょう。",
        "人生は大きな決意より、守れた小さな時間で変わります。今日の畑をひと枠だけ確保しましょう。",
        "仕事は固定ブロック。自分の時間は選べるブロックです。選べる場所に、あなたの人生を置きましょう。",
        "平日の夜や週末の端に、自分の未来は隠れています。見える予定にすると、戻りやすくなります。",
    ]
    return messages[today.toordinal() % len(messages)]


def _generate_schedule_message(today: date) -> tuple[str, bool]:
    from app.ai_client import chat

    prompt = """
あなたはライフダッシュボードのナビゲーター「アリア」です。
仕事以外の時間を充実させる重要性を、短い格言のように日本語で1文だけ返してください。
条件:
- 90文字以内
- 説教ではなく、静かに前向き
- 「仕事以外の時間」「自分の時間」「人生」のどれかに触れる
- 引用符や箇条書きは不要
"""
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(chat, prompt, 0.9)
    try:
        raw = future.result(timeout=4.5)
    except TimeoutError:
        future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)
        raw = None
    except Exception:
        raw = None
    finally:
        if future.done():
            executor.shutdown(wait=False, cancel_futures=True)
    if not raw:
        message = f"{_fallback_schedule_message(today)} ※自動生成"
        is_fallback = True
    else:
        message = raw.strip().replace("\n", " ")[:120]
        is_fallback = False
    return message, is_fallback


def _schedule_message(today: date, db: Session) -> str:
    stored = db.query(ScheduleMessage).filter(ScheduleMessage.message_date == today).first()
    if stored and not stored.is_fallback:
        return stored.message
    if stored and stored.updated_at:
        elapsed = (datetime.now() - stored.updated_at).total_seconds()
        if elapsed < 30 * 60:
            return stored.message

    message, is_fallback = _generate_schedule_message(today)
    if stored:
        stored.message = message
        stored.is_fallback = is_fallback
        db.commit()
        return message

    stored = ScheduleMessage(
        message_date=today,
        message=message,
        is_fallback=is_fallback,
    )
    db.add(stored)
    db.commit()
    return message


def _schedule_out(block: ScheduleBlock) -> ScheduleBlockOut:
    return ScheduleBlockOut(
        id=block.id,
        date=block.date.isoformat(),
        start_time=_time_str(block.start_time),
        end_time=_time_str(block.end_time),
        title=block.title,
        category=block.category,
        note=block.note,
        editable=True,
    )


def _time_analysis_section(label: str, start: date, end: date, db: Session) -> TimeAnalysisSection:
    totals = {category["key"]: 0 for category in TIME_CATEGORIES}
    blocks = (
        db.query(ScheduleBlock)
        .filter(
            ScheduleBlock.date >= start,
            ScheduleBlock.date <= end,
            ScheduleBlock.category.in_(totals.keys()),
        )
        .all()
    )
    for block in blocks:
        totals[block.category] += _minutes_between(block.start_time, block.end_time)

    categories = [
        TimeCategoryTotal(
            key=category["key"],
            label=category["label"],
            color=category["color"],
            minutes=totals[category["key"]],
            hours=round(totals[category["key"]] / 60, 1),
        )
        for category in TIME_CATEGORIES
    ]
    return TimeAnalysisSection(
        label=label,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        total_minutes=sum(totals.values()),
        categories=categories,
    )


@router.get("/time-analysis", response_model=TimeAnalysisOut)
def get_time_analysis(target_date: date | None = None, db: Session = Depends(get_db)):
    from calendar import monthrange

    selected = target_date or date.today()
    week_start = _week_start(selected)
    month_start = selected.replace(day=1)
    month_end = selected.replace(day=monthrange(selected.year, selected.month)[1])

    return TimeAnalysisOut(
        selected_date=selected.isoformat(),
        daily=_time_analysis_section(
            selected.strftime("%Y/%m/%d"),
            selected,
            selected,
            db,
        ),
        weekly=_time_analysis_section(
            f"{week_start.strftime('%Y/%m/%d')}〜{(week_start + timedelta(days=6)).strftime('%m/%d')}",
            week_start,
            week_start + timedelta(days=6),
            db,
        ),
        monthly=_time_analysis_section(
            selected.strftime("%Y/%m"),
            month_start,
            month_end,
            db,
        ),
    )


@router.get("/schedule-week", response_model=WeekScheduleOut)
def get_schedule_week(week_start: date | None = None, db: Session = Depends(get_db)):
    start = _week_start(week_start or date.today())
    end = start + timedelta(days=6)
    today = date.today()
    blocks = (
        db.query(ScheduleBlock)
        .filter(ScheduleBlock.date >= start, ScheduleBlock.date <= end)
        .order_by(ScheduleBlock.date.asc(), ScheduleBlock.start_time.asc())
        .all()
    )
    return WeekScheduleOut(
        week_start=start.isoformat(),
        week_end=end.isoformat(),
        day_start_hour=6,
        day_end_hour=24,
        schedule_message=_schedule_message(today, db),
        blocks=_work_blocks(start) + [_schedule_out(block) for block in blocks],
    )


@router.post("/schedule-blocks", response_model=ScheduleBlockOut, status_code=201)
def create_schedule_block(payload: ScheduleBlockPayload, db: Session = Depends(get_db)):
    start = _parse_time(payload.start_time)
    end = _parse_time(payload.end_time)
    if end <= start:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")
    block = ScheduleBlock(
        date=payload.date,
        start_time=start,
        end_time=end,
        title=payload.title,
        category=payload.category,
        note=payload.note,
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return _schedule_out(block)


@router.patch("/schedule-blocks/{block_id}", response_model=ScheduleBlockOut)
def update_schedule_block(block_id: int, payload: ScheduleBlockPayload, db: Session = Depends(get_db)):
    block = db.query(ScheduleBlock).filter(ScheduleBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Schedule block not found")
    start = _parse_time(payload.start_time)
    end = _parse_time(payload.end_time)
    if end <= start:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")
    block.date = payload.date
    block.start_time = start
    block.end_time = end
    block.title = payload.title
    block.category = payload.category
    block.note = payload.note
    db.commit()
    db.refresh(block)
    return _schedule_out(block)


@router.delete("/schedule-blocks/{block_id}", status_code=204)
def delete_schedule_block(block_id: int, db: Session = Depends(get_db)):
    block = db.query(ScheduleBlock).filter(ScheduleBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Schedule block not found")
    db.delete(block)
    db.commit()
    return Response(status_code=204)


@router.post("/schedule-week/auto-plan", response_model=WeekScheduleOut, status_code=201)
def auto_plan_week(week_start: date | None = None, db: Session = Depends(get_db)):
    start = _week_start(week_start or date.today())
    candidates = [
        (start, "20:30", "21:00", "自分の畑: 30分"),
        (start + timedelta(days=2), "20:30", "21:00", "自分の畑: 30分"),
        (start + timedelta(days=4), "20:30", "21:00", "自分の畑: 30分"),
        (start + timedelta(days=5), "10:00", "11:00", "週末の畑: 60分"),
    ]
    for block_date, start_time, end_time, title in candidates:
        exists = (
            db.query(ScheduleBlock)
            .filter(
                ScheduleBlock.date == block_date,
                ScheduleBlock.start_time == _parse_time(start_time),
                ScheduleBlock.title == title,
            )
            .first()
        )
        if not exists:
            db.add(ScheduleBlock(
                date=block_date,
                start_time=_parse_time(start_time),
                end_time=_parse_time(end_time),
                title=title,
                category="self",
                note="自動配置。必要なら編集してください。",
            ))
    db.commit()
    return get_schedule_week(start, db)


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


def _sum_hours(logs: list) -> ActivityHours:
    ch = sum(getattr(l, "create_hours", 0) or 0 for l in logs)
    wh = sum(getattr(l, "workout_hours", 0) or 0 for l in logs)
    sh = sum(getattr(l, "study_hours", 0) or 0 for l in logs)
    oh = sum(getattr(l, "code_hours", 0) or 0 for l in logs)
    jh = sum(getattr(l, "job_search_hours", 0) or 0 for l in logs)
    return ActivityHours(
        create_hours=round(ch, 1),
        workout_hours=round(wh, 1),
        study_hours=round(sh, 1),
        code_hours=round(oh, 1),
        job_search_hours=round(jh, 1),
        total_advance_hours=round(ch + wh + sh + oh + jh, 1),
    )


@router.get("/weekly-hours", response_model=WeekHoursCompare)
def get_weekly_hours(db: Session = Depends(get_db)):
    today = date.today()
    this_start = today - timedelta(days=today.weekday())
    this_end = this_start + timedelta(days=6)
    last_start = this_start - timedelta(days=7)
    last_end = this_start - timedelta(days=1)

    this_logs = db.query(DailyLog).filter(DailyLog.date >= this_start, DailyLog.date <= this_end).all()
    last_logs = db.query(DailyLog).filter(DailyLog.date >= last_start, DailyLog.date <= last_end).all()

    return WeekHoursCompare(
        this_week=_sum_hours(this_logs),
        last_week=_sum_hours(last_logs),
        week_start=this_start.isoformat(),
        last_week_start=last_start.isoformat(),
    )


_pattern_cache: dict = {}
_PATTERN_TTL = 3600  # 1時間


@router.get("/patterns", response_model=PatternInsight)
def get_patterns(db: Session = Depends(get_db)):
    import time
    now = time.time()
    cache_key = date.today().isoformat()
    if cache_key in _pattern_cache:
        result, ts = _pattern_cache[cache_key]
        if now - ts < _PATTERN_TTL:
            return result

    cutoff = date.today() - timedelta(days=30)
    logs = db.query(DailyLog).filter(DailyLog.date >= cutoff).order_by(DailyLog.date.asc()).all()

    if len(logs) < 5:
        result = PatternInsight(
            insights=["まだデータが少ないです。1週間ほど記録を続けるとパターンが見えてきます。"],
            aria_comment="ご主人様、もう少しデータが集まったら分析しますね！記録を続けてください。"
        )
        return result

    result = _analyze_patterns(logs)
    _pattern_cache[cache_key] = (result, now)
    return result


def _analyze_patterns(logs: list) -> PatternInsight:
    from app.ai_client import chat

    lines = []
    for l in logs:
        flags = []
        if l.did_workout: flags.append(f"筋トレ{getattr(l,'workout_hours',0) or 0}h")
        if l.did_create: flags.append(f"創作{getattr(l,'create_hours',0) or 0}h")
        if l.did_code: flags.append(f"開発{getattr(l,'code_hours',0) or 0}h")
        if l.went_outside: flags.append("外出")
        if l.visited_cafe: flags.append("カフェ")
        if l.napped: flags.append("昼寝")
        if l.drank_alcohol: flags.append("飲酒")
        discharge = l.discharge_activities or ""
        lines.append(
            f"{l.date}: 睡眠{l.sleep_hours}h 残業{l.overtime_hours}h 気分{l.mood_score}/5 "
            f"エネルギー{getattr(l,'energy_level',2)}/3 {' '.join(flags)}"
            + (f" 発散:{discharge[:20]}" if discharge else "")
        )

    log_text = "\n".join(lines)

    prompt = f"""あなたは「アリア」です。ご主人様の過去30日間の生活ログを分析してください。

【ログデータ】
{log_text}

以下の観点でパターンを分析してください：
- 創作・開発が進む条件（前日の睡眠、外出、カフェなど）
- 気分が良い日の共通点
- ストレス・疲れのサイン
- 回復方法の効果
- 改善できそうな習慣

以下のJSONのみ返してください（コードブロック不要）：
{{"insights":["パターン1（具体的に）","パターン2","パターン3（3〜5個）"],"aria_comment":"総合コメント（2文、アリアらしく、ご主人様と呼んで）"}}"""

    raw = chat(prompt, temperature=0.6)
    if raw is None:
        return _fallback_patterns(logs)

    from app.ai_client import parse_json
    data = parse_json(raw)
    return PatternInsight(
        insights=data.get("insights", []),
        aria_comment=data.get("aria_comment", "")
    )


def _fallback_patterns(logs: list) -> PatternInsight:
    cafe_logs = [l for l in logs if l.visited_cafe]
    cafe_create = sum(1 for l in cafe_logs if l.did_create)
    insights = []
    if cafe_logs and cafe_create / len(cafe_logs) > 0.5:
        insights.append(f"カフェへ行った日は{int(cafe_create/len(cafe_logs)*100)}%の確率で創作できています")

    workout_logs = [l for l in logs if l.did_workout]
    if workout_logs:
        avg_mood = sum(l.mood_score for l in workout_logs) / len(workout_logs)
        insights.append(f"筋トレした日の平均気分スコアは{round(avg_mood,1)}/5です")

    sleep_good = [l for l in logs if l.sleep_hours >= 7]
    if sleep_good:
        avg_mood = sum(l.mood_score for l in sleep_good) / len(sleep_good)
        insights.append(f"7時間以上寝た日の平均気分は{round(avg_mood,1)}/5です")

    if not insights:
        insights = ["データを蓄積中です。続けて記録してください。"]

    return PatternInsight(
        insights=insights,
        aria_comment="ご主人様のパターンが少しずつ見えてきました！記録を続けるともっと詳しく分析できます。"
    )


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
