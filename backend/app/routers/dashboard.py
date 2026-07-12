import time as time_module
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai_client import chat, parse_json
from app.category_catalog import SCHEDULE_CATEGORIES, SCHEDULE_LABELS
from app.database import get_db
from app.models import (
    ActiveProject,
    ActiveProjectEvent,
    DailyLog,
    DashboardSetting,
    Dream,
    HabitCheck,
    InsightSeed,
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
SELF_CATEGORIES = {category["key"] for category in SCHEDULE_CATEGORIES}
CATEGORY_LABEL = SCHEDULE_LABELS
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


class FocusAction(BaseModel):
    kind: str
    key: str
    seed_id: int | None = None
    icon: str
    title: str
    reason: str
    standard_minutes: int
    minimum_minutes: int
    minimum_label: str


class FocusHabit(BaseModel):
    key: str
    label: str
    icon: str
    status: str
    standard_minutes: int
    minimum_minutes: int
    cue: str
    completed_minutes: int


class FocusField(BaseModel):
    key: str
    name: str
    icon: str
    color: str
    score: int
    connection_label: str
    connection_tone: str
    days_since_touch: int | None


class FocusPrinciple(BaseModel):
    id: int
    icon: str
    title: str
    text: str


class FocusHomeOut(BaseModel):
    action: FocusAction
    habits: list[FocusHabit]
    fields: list[FocusField]
    principle: FocusPrinciple


class HabitCheckPayload(BaseModel):
    minutes: int = Field(ge=0, le=480)


class InsightSeedPayload(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    insight: str = Field(min_length=1, max_length=4000)
    personal_rule: str = Field(min_length=1, max_length=4000)
    linked_actions: str = Field(default="", max_length=240)


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


FOCUS_HABITS = {
    "meditation": {
        "label": "瞑想", "icon": "🧘", "standard": 5, "minimum": 1,
        "minimum_label": "1分だけ静かに座る", "cue": "仕事終了後", "field": "mind",
    },
    "reading": {
        "label": "読書", "icon": "📚", "standard": 15, "minimum": 2,
        "minimum_label": "本を2ページだけ読む", "cue": "休憩か就寝前", "field": "knowledge",
    },
    "creation": {
        "label": "創作", "icon": "🎨", "standard": 30, "minimum": 10,
        "minimum_label": "続きを10分だけ開く", "cue": "自分の時間が始まったら", "field": "creation",
    },
}


def _habit_is_due(key: str, weekday: int) -> bool:
    if key == "meditation":
        return True
    if key == "reading":
        return weekday in {0, 3, 6}
    return weekday in {1, 2, 5}


def _seed_focus_defaults(db: Session) -> None:
    if db.query(InsightSeed).first():
        return
    db.add_all([
        InsightSeed(
            title="習慣は人生を味わうためにある",
            insight="瞑想の時間を増やすこと自体が目的ではない。人生を穏やかに味わえる状態を作るために行う。",
            personal_rule="生活を圧迫する習慣は、量を減らす。",
            linked_actions="meditation,rest,reading",
        ),
        InsightSeed(
            title="ダイヤモンドも掘り出さなければ見つからない",
            insight="価値があるだけでは、人には伝わらない。掘り出し、磨き、陳列し、届ける必要がある。",
            personal_rule="創作したら、外へ出すところまでを一つの循環とする。",
            linked_actions="creation,social,publish",
        ),
    ])
    db.commit()


def _focus_habits(db: Session, today: date, connection_events: list[dict]) -> list[FocusHabit]:
    checks = {
        row.habit_key: row
        for row in db.query(HabitCheck).filter(HabitCheck.check_date == today).all()
    }
    result = []
    for key, definition in FOCUS_HABITS.items():
        check = checks.get(key)
        field_minutes = sum(
            event["duration_minutes"] or 0
            for event in connection_events
            if event["performed_on"] == today and event["category_key"] == definition["field"]
        )
        completed_minutes = max(check.minutes if check else 0, field_minutes)
        due = _habit_is_due(key, today.weekday())
        if completed_minutes >= definition["standard"]:
            status = "done"
        elif completed_minutes >= definition["minimum"]:
            status = "minimum"
        elif due:
            status = "today"
        else:
            status = "off"
        result.append(FocusHabit(
            key=key,
            label=definition["label"],
            icon=definition["icon"],
            status=status,
            standard_minutes=definition["standard"],
            minimum_minutes=definition["minimum"],
            cue=definition["cue"],
            completed_minutes=completed_minutes,
        ))
    return result


def _connection_state(category_key: str, days_since: int | None, weekday: int) -> tuple[str, str]:
    if days_since == 0:
        return "今日も接続中", "hot"
    if category_key == "body" and weekday in {1, 6}:
        return "再接続できる", "reconnect"
    if category_key == "life" and days_since is None:
        return "今週は静か", "quiet"
    if category_key == "body" and weekday not in {1, 6} and days_since is not None and days_since <= 4:
        return "休息日", "rest"
    if days_since == 1:
        return "まだ温かい", "warm"
    if days_since is not None and days_since <= 3:
        return "少し離れている", "connected"
    if days_since is not None:
        return "再接続できる", "reconnect"
    return "今週は静か", "quiet"


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


@router.get("/focus", response_model=FocusHomeOut)
def get_focus_home(db: Session = Depends(get_db)):
    today = date.today()
    hour = datetime.now().hour

    from app.routers.soil import CATEGORIES as SOIL_CATEGORIES, _compute_field_scores, _connection_events
    scores, _ = _compute_field_scores(db)
    connection_events = _connection_events(db, today - timedelta(days=30), today)
    habits = _focus_habits(db, today, connection_events)
    connection_by_category = {
        item["key"]: [event for event in connection_events if event["category_key"] == item["key"]]
        for item in SOIL_CATEGORIES
    }
    fields = []
    for item in SOIL_CATEGORIES:
        recent = connection_by_category[item["key"]]
        days_since = (today - recent[0]["performed_on"]).days if recent else None
        connection_label, connection_tone = _connection_state(item["key"], days_since, today.weekday())
        fields.append(FocusField(
            key=item["key"],
            name=item["name"],
            icon=item["icon"], color=item["color"], score=scores[item["key"]],
            connection_label=connection_label, connection_tone=connection_tone,
            days_since_touch=days_since,
        ))
    score_by_key = {field.key: field.score for field in fields}

    latest_log = db.query(DailyLog).order_by(DailyLog.date.desc()).first()
    today_log = latest_log if latest_log and latest_log.date == today else None
    current_seed = (
        db.query(SeedTask)
        .filter(SeedTask.status.in_(["planted", "active"]))
        .order_by((SeedTask.status == "planted").desc(), SeedTask.updated_at.desc())
        .first()
    )
    planted_seed_ids = {
        row[0] for row in db.query(ScheduleBlock.seed_task_id).filter(
            ScheduleBlock.date == today,
            ScheduleBlock.seed_task_id.is_not(None),
        ).all()
    }
    due_undone = [
        habit for habit in habits if habit.status == "today"
    ]
    days_by_key = {field.key: field.days_since_touch for field in fields}
    due_undone.sort(key=lambda habit: (
        -(days_by_key.get(FOCUS_HABITS[habit.key]["field"]) or 0),
        score_by_key.get(FOCUS_HABITS[habit.key]["field"], 0),
    ))

    if today_log and (today_log.energy_level == 1 or today_log.mood_score <= 2):
        definition = FOCUS_HABITS["meditation"]
        action = FocusAction(
            kind="habit", key="meditation", icon=definition["icon"],
            title=definition["minimum_label"],
            reason="今日は増やす日ではなく、人生を圧迫しない形へ整える日です。",
            standard_minutes=definition["standard"], minimum_minutes=definition["minimum"],
            minimum_label=definition["minimum_label"],
        )
    elif today.weekday() == 6 and hour < 12 and not any(
        event["category_key"] == "body" and event["performed_on"] == today for event in connection_events
    ):
        action = FocusAction(
            kind="calendar", key="workout", icon="💪", title="朝のジム",
            reason="身体を整えたら、その後の今日は自由です。",
            standard_minutes=60, minimum_minutes=10, minimum_label="10分だけ身体を動かす",
        )
    elif today.weekday() == 1 and not any(
        event["category_key"] == "body" and event["performed_on"] == today for event in connection_events
    ):
        action = FocusAction(
            kind="calendar", key="workout", icon="⭕", title="リングフィットを30分",
            reason="最低ラインは10分。身体との接続を軽く保つ日です。",
            standard_minutes=30, minimum_minutes=10, minimum_label="10分だけ身体を動かす",
        )
    elif hour >= 22 and due_undone:
        habit = due_undone[0]
        definition = FOCUS_HABITS[habit.key]
        action = FocusAction(
            kind="habit", key=habit.key, icon=habit.icon,
            title=definition["minimum_label"],
            reason="もう遅い時間です。最低ラインだけで、今日は十分です。",
            standard_minutes=habit.standard_minutes, minimum_minutes=habit.minimum_minutes,
            minimum_label=definition["minimum_label"],
        )
    elif current_seed and current_seed.id not in planted_seed_ids and today.weekday() in {2, 5}:
        action = FocusAction(
            kind="seed", key=current_seed.category, seed_id=current_seed.id,
            icon="💎" if current_seed.category == "creation" else "🌱",
            title=current_seed.title,
            reason=current_seed.purpose or "夢を、今日の小さな行動へ変えます。",
            standard_minutes=current_seed.estimated_minutes,
            minimum_minutes=min(10, current_seed.estimated_minutes),
            minimum_label=f"{min(10, current_seed.estimated_minutes)}分だけ続きを開く",
        )
    elif due_undone:
        habit = due_undone[0]
        definition = FOCUS_HABITS[habit.key]
        action = FocusAction(
            kind="habit", key=habit.key, icon=habit.icon,
            title=f"{habit.label}を{habit.standard_minutes}分",
            reason="習慣のために人生を削らず、今日に馴染む量だけ行います。",
            standard_minutes=habit.standard_minutes, minimum_minutes=habit.minimum_minutes,
            minimum_label=definition["minimum_label"],
        )
    elif current_seed and current_seed.id not in planted_seed_ids:
        action = FocusAction(
            kind="seed", key=current_seed.category, seed_id=current_seed.id,
            icon="💎" if current_seed.category == "creation" else "🌱",
            title=current_seed.title,
            reason=current_seed.purpose or "夢を、今日の小さな行動へ変えます。",
            standard_minutes=current_seed.estimated_minutes,
            minimum_minutes=min(10, current_seed.estimated_minutes),
            minimum_label=f"{min(10, current_seed.estimated_minutes)}分だけ続きを開く",
        )
    else:
        action = FocusAction(
            kind="rest", key="rest", icon="🌙", title="今日はもう自由です",
            reason="必要な畑仕事は終わっています。余白も人生の一部です。",
            standard_minutes=0, minimum_minutes=0, minimum_label="休む",
        )

    _seed_focus_defaults(db)
    principle = (
        db.query(InsightSeed)
        .filter(InsightSeed.is_active.is_(True), InsightSeed.linked_actions.contains(action.key))
        .order_by(InsightSeed.updated_at.desc())
        .first()
        or db.query(InsightSeed).filter(InsightSeed.is_active.is_(True)).order_by(InsightSeed.id.asc()).first()
    )
    principle_icon = "💎" if principle and "ダイヤモンド" in principle.title else "🧘"

    return FocusHomeOut(
        action=action,
        habits=habits,
        fields=fields,
        principle=FocusPrinciple(
            id=principle.id,
            icon=principle_icon,
            title=principle.title,
            text=principle.insight,
        ),
    )


@router.put("/focus/habits/{habit_key}", response_model=FocusHabit)
def update_focus_habit(habit_key: str, payload: HabitCheckPayload, db: Session = Depends(get_db)):
    if habit_key not in FOCUS_HABITS:
        raise HTTPException(status_code=404, detail="Habit not found")
    today = date.today()
    row = db.query(HabitCheck).filter(
        HabitCheck.habit_key == habit_key,
        HabitCheck.check_date == today,
    ).first()
    if row:
        row.minutes = payload.minutes
    else:
        row = HabitCheck(habit_key=habit_key, check_date=today, minutes=payload.minutes)
        db.add(row)
    db.commit()
    definition = FOCUS_HABITS[habit_key]
    status = "done" if payload.minutes >= definition["standard"] else "minimum" if payload.minutes > 0 else "today"
    return FocusHabit(
        key=habit_key, label=definition["label"], icon=definition["icon"], status=status,
        standard_minutes=definition["standard"], minimum_minutes=definition["minimum"],
        cue=definition["cue"], completed_minutes=payload.minutes,
    )


@router.get("/focus/insights", response_model=list[FocusPrinciple])
def list_focus_insights(db: Session = Depends(get_db)):
    _seed_focus_defaults(db)
    rows = db.query(InsightSeed).filter(InsightSeed.is_active.is_(True)).order_by(InsightSeed.id.asc()).all()
    return [FocusPrinciple(
        id=row.id,
        icon="💎" if "ダイヤモンド" in row.title else "🧘",
        title=row.title,
        text=row.insight,
    ) for row in rows]


@router.post("/focus/insights", response_model=FocusPrinciple, status_code=201)
def create_focus_insight(payload: InsightSeedPayload, db: Session = Depends(get_db)):
    row = InsightSeed(
        title=payload.title, insight=payload.insight, personal_rule=payload.personal_rule,
        linked_actions=payload.linked_actions,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return FocusPrinciple(id=row.id, icon="💎", title=row.title, text=row.insight)


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
