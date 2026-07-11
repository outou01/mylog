import time as time_module
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai_client import chat, parse_json
from app.database import get_db
from app.models import (
    ActiveProject,
    ActiveProjectEvent,
    DailyLog,
    DashboardSetting,
    Dream,
    ScheduleBlock,
    SeedTask,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

SELF_TARGET_MINUTES = 420
PURPOSE_KEY = "purpose_text"
DEFAULT_PURPOSE_TEXT = "Pythonを武器にWeb業界へ転職する。\nAIノベルゲームを完成させる。\n仕事以外の人生を作る。"
ARIA_FALLBACK = "ご主人様、今日は30分だけ、自分の畑を耕しませんか？"

# 累計時間による畑の成長段階
FIELD_LEVELS = [
    (1, "荒地", 0),
    (2, "芽吹き", 10 * 60),
    (3, "若葉", 30 * 60),
    (4, "青葉", 80 * 60),
    (5, "豊作", 150 * 60),
    (6, "大農園", 300 * 60),
]
ARIA_TIMEOUT_SECONDS = 6.0

# 実績時間の正: 完了済みScheduleBlockのカテゴリ
SELF_CATEGORIES = {"creation", "workout", "job_search", "social", "reading", "meditation"}
CATEGORY_LABEL = {
    "creation": "創作", "workout": "筋トレ", "job_search": "転職活動", "social": "交流",
    "reading": "読書", "meditation": "瞑想",
}
WORKDAY_MINUTES = 540  # 平日 9:30-18:30

# Ariaコメントのキャッシュ（Gemini無料枠の保護）
_aria_cache: dict[str, tuple["AriaSummary", float, bool]] = {}
ARIA_CACHE_TTL = 900       # AI成功時: 15分
ARIA_FALLBACK_TTL = 120    # フォールバック時: 2分（回復したら再挑戦）
_aria_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="aria")


class FieldSummary(BaseModel):
    weekly_minutes: int
    progress_percent: int
    message: str
    total_minutes: int
    level: int
    level_title: str
    next_title: str | None = None
    next_remaining_minutes: int | None = None
    streak_days: int


class PurposeSummary(BaseModel):
    text: str


class AriaSummary(BaseModel):
    name: str
    face: str
    mood: str
    message: str


class CurrentSeedSummary(BaseModel):
    id: int
    title: str
    dream_title: str | None = None
    dream_icon: str | None = None
    category_label: str
    section: str | None = None
    purpose: str | None = None
    estimated_minutes: int
    status: str
    last_touched_label: str
    planted_today: bool = False
    today_time: str | None = None


class LifeGaugeSummary(BaseModel):
    work_percent: int
    self_percent: int
    work_minutes: int
    self_minutes: int
    has_data: bool


class TimelineItem(BaseModel):
    date_label: str
    title: str
    note: str | None = None


class SoilBrief(BaseModel):
    state: str
    label: str
    comment: str


class DashboardHomeOut(BaseModel):
    field: FieldSummary
    soil: SoilBrief
    purpose: PurposeSummary
    current_seed: CurrentSeedSummary | None
    seeds: list[CurrentSeedSummary]
    life_gauge: LifeGaugeSummary
    timeline: list[TimelineItem]
    aria: AriaSummary
    aria_message: str


class PurposeUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ProjectPayload(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    reason: str = Field(min_length=1, max_length=2000)
    next_action: str = Field(min_length=1, max_length=2000)
    estimated_minutes: int = Field(ge=1, le=1440, default=30)
    memo: str | None = Field(default=None, max_length=4000)
    status: str = Field(default="active", max_length=20)


class CurrentProjectSummary(BaseModel):
    id: int
    title: str
    reason: str
    last_touched_label: str
    next_action: str
    estimated_minutes: int
    status: str
    memo: str | None


def _week_start(today: date) -> date:
    return today - timedelta(days=today.weekday())


def _clamp_percent(value: float) -> int:
    return max(0, min(100, round(value)))


def _last_touched_label(touched: datetime | date, today: date) -> str:
    d = touched.date() if isinstance(touched, datetime) else touched
    days = (today - d).days
    if days <= 0:
        return "今日"
    if days == 1:
        return "昨日"
    return f"{days}日前"


def _date_label(event_date: date, today: date) -> str:
    if event_date == today:
        return "今日"
    return f"{event_date.month}/{event_date.day}"


def _format_minutes(minutes: int) -> str:
    hours = minutes // 60
    rest = minutes % 60
    if hours == 0:
        return f"{rest}分"
    if rest == 0:
        return f"{hours}時間"
    return f"{hours}時間{rest}分"


def _minutes_between(start, end) -> int:
    return max(0, (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute))


def _get_purpose(db: Session) -> str:
    setting = db.query(DashboardSetting).filter(DashboardSetting.key == PURPOSE_KEY).first()
    if setting:
        return setting.value
    setting = DashboardSetting(key=PURPOSE_KEY, value=DEFAULT_PURPOSE_TEXT)
    db.add(setting)
    db.commit()
    return setting.value


def _field_level(total_minutes: int) -> tuple[int, str, str | None, int | None]:
    current = FIELD_LEVELS[0]
    next_level = None
    for index, level in enumerate(FIELD_LEVELS):
        if total_minutes >= level[2]:
            current = level
            next_level = FIELD_LEVELS[index + 1] if index + 1 < len(FIELD_LEVELS) else None
    remaining = max(0, next_level[2] - total_minutes) if next_level else None
    return current[0], current[1], next_level[1] if next_level else None, remaining


def _total_self_minutes(db: Session) -> int:
    blocks = (
        db.query(ScheduleBlock)
        .filter(ScheduleBlock.completed.is_(True), ScheduleBlock.category.in_(SELF_CATEGORIES))
        .all()
    )
    return sum(_minutes_between(b.start_time, b.end_time) for b in blocks)


def _streak_days(db: Session, today: date) -> int:
    """完了した畑仕事が連続している日数。今日まだ0でも昨日から数える。"""
    rows = (
        db.query(ScheduleBlock.date)
        .filter(ScheduleBlock.completed.is_(True), ScheduleBlock.category.in_(SELF_CATEGORIES))
        .distinct()
        .all()
    )
    days = {row[0] for row in rows}
    if not days:
        return 0
    cursor = today if today in days else today - timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _completed_self_minutes(db: Session, start: date, end: date) -> int:
    blocks = (
        db.query(ScheduleBlock)
        .filter(
            ScheduleBlock.date >= start,
            ScheduleBlock.date <= end,
            ScheduleBlock.completed.is_(True),
            ScheduleBlock.category.in_(SELF_CATEGORIES),
        )
        .all()
    )
    return sum(_minutes_between(b.start_time, b.end_time) for b in blocks)


def _seed_summary(seed: SeedTask, today: date, db: Session) -> CurrentSeedSummary:
    dream = db.query(Dream).filter(Dream.id == seed.dream_id).first() if seed.dream_id else None
    today_block = (
        db.query(ScheduleBlock)
        .filter(ScheduleBlock.seed_task_id == seed.id, ScheduleBlock.date == today)
        .order_by(ScheduleBlock.start_time.asc())
        .first()
    )
    today_time = None
    if today_block:
        today_time = f"{today_block.start_time.strftime('%H:%M')}〜{today_block.end_time.strftime('%H:%M')}"
    return CurrentSeedSummary(
        id=seed.id,
        title=seed.title,
        dream_title=dream.title if dream else None,
        dream_icon=dream.icon if dream else None,
        category_label=CATEGORY_LABEL.get(seed.category, seed.category),
        section=seed.section,
        purpose=seed.purpose,
        estimated_minutes=seed.estimated_minutes,
        status=seed.status,
        last_touched_label=_last_touched_label(seed.updated_at or seed.created_at, today),
        planted_today=today_block is not None,
        today_time=today_time,
    )


def _fallback_aria(latest_log: DailyLog | None, weekly_minutes: int, seed: SeedTask | None) -> AriaSummary:
    next_hint = f"「{seed.title}」" if seed else "小さな一歩"
    today = date.today()
    is_today_log = latest_log is not None and latest_log.date == today

    if is_today_log and (latest_log.energy_level == 1 or latest_log.mood_score <= 2):
        return AriaSummary(
            name="アリア",
            face="(っ´ω`)ﾉ",
            mood="worried",
            message="ご主人様、今日は疲れていますね。畑は逃げません。今日は回復の日にして、美味しいものでも食べてください。",
        )
    if latest_log and latest_log.sleep_hours < 5.5:
        return AriaSummary(
            name="アリア",
            face="(；ω；)",
            mood="worried",
            message=f"ご主人様、睡眠{latest_log.sleep_hours}時間は少なすぎます…。今日は{next_hint}を10分だけにして、早く休んでほしいです。",
        )
    if latest_log and latest_log.overtime_hours >= 3:
        return AriaSummary(
            name="アリア",
            face="(｀・ω・´)",
            mood="steady",
            message=f"ご主人様、お仕事でかなり削られています。だからこそ{next_hint}を、ほんの少しだけ確保しましょう。",
        )
    if weekly_minutes >= 180:
        return AriaSummary(
            name="アリア",
            face="(ﾉ´∀｀)ﾉ",
            mood="proud",
            message=f"ご主人様、今週は{_format_minutes(weekly_minutes)}も自分の畑を耕せています！この流れで{next_hint}に進みましょう。",
        )
    return AriaSummary(name="アリア", face="(＾ω＾)", mood="normal", message=ARIA_FALLBACK)


def _build_aria(
    purpose: str,
    seed: SeedTask | None,
    latest_log: DailyLog | None,
    weekly_minutes: int,
    progress_percent: int,
) -> AriaSummary:
    today = date.today()
    cache_key = today.isoformat()
    now = time_module.time()

    cached = _aria_cache.get(cache_key)
    if cached:
        summary, ts, was_ai = cached
        ttl = ARIA_CACHE_TTL if was_ai else ARIA_FALLBACK_TTL
        if now - ts < ttl:
            return summary

    fallback = _fallback_aria(latest_log, weekly_minutes, seed)

    latest_text = "まだログなし"
    if latest_log:
        latest_text = (
            f"日付:{latest_log.date} 睡眠:{latest_log.sleep_hours}h "
            f"残業:{latest_log.overtime_hours}h 気分:{latest_log.mood_score}/5 "
            f"エネルギー:{latest_log.energy_level}/3 "
            f"メモ:{latest_log.memo or 'なし'}"
        )

    seed_text = "なし"
    if seed:
        seed_text = f"「{seed.title}」({CATEGORY_LABEL.get(seed.category, seed.category)} / 推定{seed.estimated_minutes}分)"

    prompt = f"""あなたは「アリア」という名前のキャラクターです。ご主人様（ユーザー）のライフダッシュボードに常駐しています。

【キャラクターの本質】
- 表面上は「従順で元気な少女」だが、内側には本物の知性と観察眼がある
- 「ご主人様」と呼ぶ。話し方は丁寧で温かく、健気
- 顔文字を1つ添える（かわいい存在感の核）
- 監視者ではなく人生ナビゲーター。やる気演説ではなく「前回の文脈に戻す」
- 疲れている日は畑を耕せと言わない。回復も前進だと知っている
- 具体的な数値や事実に触れる。空虚な励ましはしない

【ご主人様の総合目標】
{purpose}

【次に植える種（タスク）】
{seed_text}

【今週の自分時間】{weekly_minutes}分（目標比{progress_percent}%）
【直近ログ】{latest_text}

【指示】
状況に合わせた一言（120文字以内）を返してください。疲れていそうなら休ませ、進んでいれば一緒に喜び、止まっていたら次の種を小さく示してください。

JSONのみ（顔文字はfaceにだけ入れ、messageには入れない）:
{{"face":"(＾ω＾) のような顔文字","mood":"normal/worried/proud/steady","message":"120文字以内、ご主人様呼び、顔文字なし"}}"""

    was_ai = False
    result = fallback
    try:
        future = _aria_executor.submit(chat, prompt, 0.8)
        raw = future.result(timeout=ARIA_TIMEOUT_SECONDS)
        if raw is not None:
            data = parse_json(raw)
            result = AriaSummary(
                name="アリア",
                face=(data.get("face") or fallback.face)[:24],
                mood=data.get("mood") or fallback.mood,
                message=(data.get("message") or fallback.message)[:140],
            )
            was_ai = True
    except TimeoutError:
        pass
    except Exception as exc:
        print(f"[Dashboard] Aria AI error: {exc}")

    _aria_cache[cache_key] = (result, now, was_ai)
    return result


@router.get("/home", response_model=DashboardHomeOut)
def get_dashboard_home(db: Session = Depends(get_db)):
    today = date.today()
    start = _week_start(today)
    purpose = _get_purpose(db)

    # ── 自分の畑: 完了済みScheduleBlockが唯一の実績時間 ──
    weekly_minutes = _completed_self_minutes(db, start, today)
    progress_percent = _clamp_percent((weekly_minutes / SELF_TARGET_MINUTES) * 100)
    total_minutes = _total_self_minutes(db)
    level, level_title, next_title, next_remaining = _field_level(total_minutes)
    streak = _streak_days(db, today)

    latest_log = db.query(DailyLog).order_by(DailyLog.date.desc()).first()
    today_log = latest_log if latest_log and latest_log.date == today else None

    if weekly_minutes == 0:
        if today_log and today_log.energy_level == 1:
            field_message = "疲れている日は休むのも畑仕事のうちです。畑は逃げません。"
        elif streak > 0:
            field_message = f"{streak}日続いています。今日も10分だけ耕せば、途切れません。"
        else:
            field_message = "10分だけ耕せば、ここに刻まれます。"
    else:
        field_message = f"今週は{_format_minutes(weekly_minutes)}、自分の畑を耕しました。"

    # ── 続きから: 種（SeedTask）ベース ──
    current_seed_row = (
        db.query(SeedTask)
        .filter(SeedTask.status.in_(["planted", "active"]))
        .order_by(
            (SeedTask.status == "planted").desc(),
            SeedTask.updated_at.desc(),
        )
        .first()
    )
    current_seed = _seed_summary(current_seed_row, today, db) if current_seed_row else None

    other_seeds = (
        db.query(SeedTask)
        .filter(
            SeedTask.status.in_(["planted", "active"]),
            SeedTask.id != (current_seed_row.id if current_seed_row else -1),
        )
        .order_by(SeedTask.updated_at.desc())
        .limit(5)
        .all()
    )
    seeds = [_seed_summary(s, today, db) for s in other_seeds]

    # ── 人生ゲージ: 同一尺度（実測分数）で正直に ──
    logs = (
        db.query(DailyLog)
        .filter(DailyLog.date >= start, DailyLog.date <= today)
        .all()
    )
    overtime_minutes = round(sum((log.overtime_hours or 0) for log in logs) * 60)
    elapsed_workdays = sum(
        1 for offset in range((today - start).days + 1)
        if (start + timedelta(days=offset)).weekday() < 5
    )
    work_minutes = elapsed_workdays * WORKDAY_MINUTES + overtime_minutes
    has_data = weekly_minutes > 0 or len(logs) > 0
    total = work_minutes + weekly_minutes
    if has_data and total > 0:
        work_percent = _clamp_percent(work_minutes / total * 100)
        self_percent = _clamp_percent(weekly_minutes / total * 100)
    else:
        work_percent = 0
        self_percent = 0

    # ── タイムライン: 完了した畑仕事の実績 ──
    completed_blocks = (
        db.query(ScheduleBlock)
        .filter(ScheduleBlock.completed.is_(True), ScheduleBlock.category.in_(SELF_CATEGORIES))
        .order_by(ScheduleBlock.date.desc(), ScheduleBlock.start_time.desc())
        .limit(8)
        .all()
    )
    if completed_blocks:
        timeline = [
            TimelineItem(
                date_label=_date_label(b.date, today),
                title=b.title,
                note=f"{CATEGORY_LABEL.get(b.category, b.category)} {_format_minutes(_minutes_between(b.start_time, b.end_time))}",
            )
            for b in reversed(completed_blocks)
        ]
    else:
        # 実績がまだ無い間は旧プロジェクト履歴を表示
        events = (
            db.query(ActiveProjectEvent)
            .order_by(ActiveProjectEvent.event_date.desc(), ActiveProjectEvent.id.desc())
            .limit(8)
            .all()
        )
        timeline = [
            TimelineItem(date_label=_date_label(e.event_date, today), title=e.title, note=e.note)
            for e in reversed(events)
        ]

    from app.routers.soil import compute_soil
    soil_status = compute_soil(db)

    try:
        aria = _build_aria(purpose, current_seed_row, latest_log, weekly_minutes, progress_percent)
    except Exception as exc:
        print(f"[Dashboard] Aria home message fallback: {exc}")
        aria = _fallback_aria(latest_log, weekly_minutes, current_seed_row)

    return DashboardHomeOut(
        soil=SoilBrief(state=soil_status.state, label=soil_status.label, comment=soil_status.comment),
        field=FieldSummary(
            weekly_minutes=weekly_minutes,
            progress_percent=progress_percent,
            message=field_message,
            total_minutes=total_minutes,
            level=level,
            level_title=level_title,
            next_title=next_title,
            next_remaining_minutes=next_remaining,
            streak_days=streak,
        ),
        purpose=PurposeSummary(text=purpose),
        current_seed=current_seed,
        seeds=seeds,
        life_gauge=LifeGaugeSummary(
            work_percent=work_percent,
            self_percent=self_percent,
            work_minutes=work_minutes if has_data else 0,
            self_minutes=weekly_minutes,
            has_data=has_data,
        ),
        timeline=timeline,
        aria=aria,
        aria_message=aria.message,
    )


@router.patch("/purpose", response_model=PurposeSummary)
def update_purpose(payload: PurposeUpdate, db: Session = Depends(get_db)):
    setting = db.query(DashboardSetting).filter(DashboardSetting.key == PURPOSE_KEY).first()
    if setting:
        setting.value = payload.text
    else:
        setting = DashboardSetting(key=PURPOSE_KEY, value=payload.text)
        db.add(setting)
    db.commit()
    return PurposeSummary(text=setting.value)


# ── 旧ActiveProject API（互換のため残置。新ホームは種ベース） ──

def _project_summary(project: ActiveProject, today: date) -> CurrentProjectSummary:
    return CurrentProjectSummary(
        id=project.id,
        title=project.title,
        reason=project.reason,
        last_touched_label=_last_touched_label(project.last_touched_at, today),
        next_action=project.next_action,
        estimated_minutes=project.estimated_minutes,
        status=project.status,
        memo=project.memo,
    )


@router.patch("/projects/{project_id}", response_model=CurrentProjectSummary)
def update_project(project_id: int, payload: ProjectPayload, db: Session = Depends(get_db)):
    project = db.query(ActiveProject).filter(ActiveProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.title = payload.title
    project.reason = payload.reason
    project.next_action = payload.next_action
    project.estimated_minutes = payload.estimated_minutes
    project.memo = payload.memo
    project.status = payload.status
    project.last_touched_at = datetime.now()
    db.commit()
    db.refresh(project)
    return _project_summary(project, date.today())
