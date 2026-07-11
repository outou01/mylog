from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import date, datetime, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DailyLog, Dream, DreamProject, ScheduleBlock, ScheduleMessage, TimeAnalysisComment

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


class NamedTimeTotal(BaseModel):
    id: int
    title: str
    minutes: int
    hours: float


class TimeAnalysisSection(BaseModel):
    label: str
    start_date: str
    end_date: str
    scale_minutes: int
    scale_label: str
    total_minutes: int
    categories: list[TimeCategoryTotal]


class FieldLevel(BaseModel):
    level: int
    title: str
    current_threshold_minutes: int
    next_title: str | None = None
    next_threshold_minutes: int | None = None
    remaining_minutes: int | None = None


class FieldSummary(BaseModel):
    total_minutes: int
    total_hours: float
    categories: list[TimeCategoryTotal]
    dreams: list[NamedTimeTotal]
    projects: list[NamedTimeTotal]
    level: FieldLevel


class TimeAnalysisOut(BaseModel):
    selected_date: str
    field_summary: FieldSummary
    daily: TimeAnalysisSection
    weekly: TimeAnalysisSection
    monthly: TimeAnalysisSection


class TimeAnalysisCommentPayload(BaseModel):
    target_date: date | None = None
    scope: str = Field(pattern="^(daily|weekly|monthly)$")


class TimeAnalysisCommentOut(BaseModel):
    scope: str
    start_date: str
    end_date: str
    comment: str
    is_fallback: bool


class ScheduleBlockOut(BaseModel):
    id: int | None
    date: str
    start_time: str
    end_time: str
    title: str
    category: str
    note: str | None = None
    editable: bool = True
    dream_id: int | None = None
    project_id: int | None = None
    seed_task_id: int | None = None
    completed: bool = False


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
    dream_id: int | None = None
    project_id: int | None = None
    seed_task_id: int | None = None
    completed: bool = False

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
    {"key": "creation", "label": "\u5275\u4f5c", "color": "#a970d6"},
    {"key": "workout", "label": "\u7b4b\u30c8\u30ec", "color": "#f9734a"},
    {"key": "job_search", "label": "\u8ee2\u8077\u6d3b\u52d5", "color": "#5d9cec"},
    {"key": "social", "label": "\u4ea4\u6d41", "color": "#58b77b"},
    {"key": "reading", "label": "\u8aad\u66f8", "color": "#72a7e8"},
    {"key": "meditation", "label": "\u7791\u60f3", "color": "#9fc9d8"},
]

TIME_ANALYSIS_SCALES = {
    "daily": {"minutes": 8 * 60, "label": "8h"},
    "weekly": {"minutes": 20 * 60, "label": "20h"},
    "monthly": {"minutes": 80 * 60, "label": "80h"},
}

FIELD_LEVELS = [
    (1, "\u8352\u5730", 0),
    (2, "\u82bd\u5439\u304d", 10 * 60),
    (3, "\u82e5\u8449", 30 * 60),
    (4, "\u9752\u8449", 80 * 60),
    (5, "\u8c4a\u4f5c", 150 * 60),
    (6, "\u5927\u8fb2\u5712", 300 * 60),
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
            completed=False,
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
        dream_id=block.dream_id,
        project_id=block.project_id,
        seed_task_id=block.seed_task_id,
        completed=block.completed,
    )


def _time_analysis_section(scope: str, label: str, start: date, end: date, db: Session) -> TimeAnalysisSection:
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
        scale_minutes=TIME_ANALYSIS_SCALES[scope]["minutes"],
        scale_label=TIME_ANALYSIS_SCALES[scope]["label"],
        total_minutes=sum(totals.values()),
        categories=categories,
    )


def _field_level(total_minutes: int) -> FieldLevel:
    current = FIELD_LEVELS[0]
    next_level = None
    for index, level in enumerate(FIELD_LEVELS):
        if total_minutes >= level[2]:
            current = level
            next_level = FIELD_LEVELS[index + 1] if index + 1 < len(FIELD_LEVELS) else None

    return FieldLevel(
        level=current[0],
        title=current[1],
        current_threshold_minutes=current[2],
        next_title=next_level[1] if next_level else None,
        next_threshold_minutes=next_level[2] if next_level else None,
        remaining_minutes=max(0, next_level[2] - total_minutes) if next_level else None,
    )


def _field_summary(db: Session) -> FieldSummary:
    totals = {category["key"]: 0 for category in TIME_CATEGORIES}
    dream_totals: dict[int, int] = {}
    project_totals: dict[int, int] = {}
    blocks = db.query(ScheduleBlock).filter(ScheduleBlock.category.in_(totals.keys())).all()
    for block in blocks:
        minutes = _minutes_between(block.start_time, block.end_time)
        totals[block.category] += minutes
        if block.dream_id:
            dream_totals[block.dream_id] = dream_totals.get(block.dream_id, 0) + minutes
        if block.project_id:
            project_totals[block.project_id] = project_totals.get(block.project_id, 0) + minutes

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
    dreams = db.query(Dream).filter(Dream.id.in_(dream_totals.keys())).all() if dream_totals else []
    projects = db.query(DreamProject).filter(DreamProject.id.in_(project_totals.keys())).all() if project_totals else []
    total_minutes = sum(totals.values())
    return FieldSummary(
        total_minutes=total_minutes,
        total_hours=round(total_minutes / 60, 1),
        categories=categories,
        dreams=[
            NamedTimeTotal(
                id=dream.id,
                title=dream.title,
                minutes=dream_totals[dream.id],
                hours=round(dream_totals[dream.id] / 60, 1),
            )
            for dream in sorted(dreams, key=lambda item: dream_totals[item.id], reverse=True)
        ],
        projects=[
            NamedTimeTotal(
                id=project.id,
                title=project.title,
                minutes=project_totals[project.id],
                hours=round(project_totals[project.id] / 60, 1),
            )
            for project in sorted(projects, key=lambda item: project_totals[item.id], reverse=True)
        ],
        level=_field_level(total_minutes),
    )


def _time_range_for_scope(scope: str, selected: date) -> tuple[date, date]:
    from calendar import monthrange

    if scope == "daily":
        return selected, selected
    if scope == "weekly":
        start = _week_start(selected)
        return start, start + timedelta(days=6)
    month_start = selected.replace(day=1)
    month_end = selected.replace(day=monthrange(selected.year, selected.month)[1])
    return month_start, month_end


def _fallback_time_analysis_comment(scope: str, section: TimeAnalysisSection) -> str:
    top = max(section.categories, key=lambda category: category.minutes)
    low = min(section.categories, key=lambda category: category.minutes)
    total_hours = round(section.total_minutes / 60, 1)
    top_hours = round(top.minutes / 60, 1)
    if section.total_minutes == 0:
        return "今日はまだ畑に入っていません。でも、確認できたなら大丈夫です。次の一手を小さく決めましょう。"
    if scope == "daily":
        return f"今日は{top.label}を{top_hours:.1f}時間耕せています。少しでも手を入れたなら、畑はちゃんと前に進んでいます。"
    if scope == "weekly":
        return f"今週は{total_hours:.1f}時間、自分の畑に時間を使えています。特に{top.label}が伸びていますね。来週は{low.label}に15分だけ水をあげてもよさそうです。"
    return f"今月は{total_hours:.1f}時間分、自分の未来に投資できています。完璧ではなくても、これは確かな積み上げです。"


def _generate_time_analysis_comment(scope: str, section: TimeAnalysisSection) -> tuple[str, bool]:
    from app.ai_client import chat

    scope_label = {"daily": "今日の畑", "weekly": "今週の畑", "monthly": "今月の畑"}[scope]
    category_lines = "\n".join(
        f"- {category.label}: {category.hours:.1f}h"
        for category in section.categories
    )
    prompt = f"""
あなたはライフダッシュボードのナビゲーター「アリア」です。
ユーザーが仕事だけに人生を使わず、自分の未来のために使った時間を見られるように、短い感想を日本語で返してください。

対象: {scope_label}（{section.label}）
合計: {section.total_minutes / 60:.1f}h
カテゴリ別:
{category_lines}

条件:
- 2文以内
- ユーザーを責めない
- 積み上げた時間を肯定する
- 足りないカテゴリは「次の一手」に変換する
- 「自分の畑を耕している」感覚を少し出す
- 引用符、箇条書き、説明文は不要
"""
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(chat, prompt, 0.8)
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
        return _fallback_time_analysis_comment(scope, section), True
    return raw.strip().replace("\n", " ")[:180], False

@router.post("/time-analysis/comment", response_model=TimeAnalysisCommentOut)
def create_time_analysis_comment(payload: TimeAnalysisCommentPayload, db: Session = Depends(get_db)):
    selected = payload.target_date or date.today()
    start, end = _time_range_for_scope(payload.scope, selected)
    stored = (
        db.query(TimeAnalysisComment)
        .filter(
            TimeAnalysisComment.scope == payload.scope,
            TimeAnalysisComment.start_date == start,
            TimeAnalysisComment.end_date == end,
        )
        .first()
    )
    if stored and not stored.is_fallback:
        return TimeAnalysisCommentOut(
            scope=stored.scope,
            start_date=stored.start_date.isoformat(),
            end_date=stored.end_date.isoformat(),
            comment=stored.comment,
            is_fallback=stored.is_fallback,
        )
    if stored and stored.updated_at:
        elapsed = (datetime.now() - stored.updated_at).total_seconds()
        if elapsed < 30 * 60:
            return TimeAnalysisCommentOut(
                scope=stored.scope,
                start_date=stored.start_date.isoformat(),
                end_date=stored.end_date.isoformat(),
                comment=stored.comment,
                is_fallback=stored.is_fallback,
            )

    if payload.scope == "daily":
        label = start.strftime("%Y/%m/%d")
    elif payload.scope == "weekly":
        label = f"{start.strftime('%Y/%m/%d')}\u301c{end.strftime('%m/%d')}"
    else:
        label = start.strftime("%Y/%m")
    section = _time_analysis_section(payload.scope, label, start, end, db)
    comment, is_fallback = _generate_time_analysis_comment(payload.scope, section)
    if stored:
        stored.comment = comment
        stored.is_fallback = is_fallback
    else:
        stored = TimeAnalysisComment(
            scope=payload.scope,
            start_date=start,
            end_date=end,
            comment=comment,
            is_fallback=is_fallback,
        )
        db.add(stored)
    db.commit()
    return TimeAnalysisCommentOut(
        scope=payload.scope,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        comment=comment,
        is_fallback=is_fallback,
    )


@router.get("/time-analysis", response_model=TimeAnalysisOut)
def get_time_analysis(target_date: date | None = None, db: Session = Depends(get_db)):
    from calendar import monthrange

    selected = target_date or date.today()
    week_start = _week_start(selected)
    week_end = week_start + timedelta(days=6)
    month_start = selected.replace(day=1)
    month_end = selected.replace(day=monthrange(selected.year, selected.month)[1])

    return TimeAnalysisOut(
        selected_date=selected.isoformat(),
        field_summary=_field_summary(db),
        daily=_time_analysis_section(
            "daily",
            selected.strftime("%Y/%m/%d"),
            selected,
            selected,
            db,
        ),
        weekly=_time_analysis_section(
            "weekly",
            f"{week_start.strftime('%Y/%m/%d')}\u301c{week_end.strftime('%m/%d')}",
            week_start,
            week_end,
            db,
        ),
        monthly=_time_analysis_section(
            "monthly",
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
        dream_id=payload.dream_id,
        project_id=payload.project_id,
        seed_task_id=payload.seed_task_id,
        completed=payload.completed,
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
    block.dream_id = payload.dream_id
    block.project_id = payload.project_id
    block.seed_task_id = payload.seed_task_id
    block.completed = payload.completed
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
