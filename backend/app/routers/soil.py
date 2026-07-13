"""土壌（体調基盤）API — 記録は異常時だけ、状態は自動判定、報告は週一で一つだけ"""
import time as time_module
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai_client import chat, parse_json
from app.database import get_db
from app.models import DailyLog, HabitCheck, ScheduleBlock
from app.schemas import DailyLogOut

router = APIRouter(prefix="/soil", tags=["soil"])

RECOVERY_FLAGS = [
    "went_outside", "ate_good_food", "took_walk", "visited_cafe",
    "visited_akihabara", "napped", "played_games", "talked_with_friends", "did_nothing",
]

_report_cache: dict[str, tuple] = {}
_REPORT_TTL = 12 * 3600  # 週次報告は12時間キャッシュ


class SoilStatus(BaseModel):
    state: str  # rich / ok / dry / unknown
    label: str
    sleep_score: int
    mood_score: int
    recovery_score: int
    avg_sleep: float
    log_days: int
    comment: str


class UsualResult(BaseModel):
    created: bool
    log: DailyLogOut


class WeeklySoilReport(BaseModel):
    week_start: str
    avg_sleep: float
    prev_avg_sleep: float
    avg_mood: float
    prev_avg_mood: float
    workout_days: int
    alcohol_days: int
    overtime_hours: float
    message: str
    is_ai: bool


def _recent_logs(db: Session, days: int, end: date | None = None) -> list[DailyLog]:
    end = end or date.today()
    start = end - timedelta(days=days - 1)
    return (
        db.query(DailyLog)
        .filter(DailyLog.date >= start, DailyLog.date <= end)
        .order_by(DailyLog.date.asc())
        .all()
    )


def _recovery_count(log: DailyLog) -> int:
    return sum(1 for flag in RECOVERY_FLAGS if getattr(log, flag, False))


def compute_soil(db: Session) -> SoilStatus:
    """直近7日のログから土壌の状態を自動判定する。"""
    logs = _recent_logs(db, 7)
    if not logs:
        return SoilStatus(
            state="unknown", label="観測なし",
            sleep_score=0, mood_score=0, recovery_score=0,
            avg_sleep=0, log_days=0,
            comment="まだ土の様子が分かりません。「いつも通り」を押すだけで観測が始まります。",
        )

    avg_sleep = sum(l.sleep_hours for l in logs) / len(logs)
    avg_mood = sum(l.mood_score for l in logs) / len(logs)
    avg_energy = sum(l.energy_level or 2 for l in logs) / len(logs)
    recovery_days = sum(1 for l in logs if _recovery_count(l) > 0 or l.did_workout)

    sleep_score = max(0, min(100, round((avg_sleep / 7.0) * 100)))
    mood_score = max(0, min(100, round(((avg_mood - 1) / 4) * 100)))
    recovery_score = max(0, min(100, round(
        (recovery_days / len(logs)) * 60 + ((avg_energy - 1) / 2) * 40
    )))

    overall = sleep_score * 0.45 + mood_score * 0.25 + recovery_score * 0.3
    if overall >= 70:
        state, label = "rich", "肥えている"
        comment = "良い土です。種がよく育ちます。"
    elif overall >= 45:
        state, label = "ok", "まずまず"
        comment = "悪くない土です。睡眠を少し足すと、もっと肥えます。"
    else:
        state, label = "dry", "乾いている"
        comment = "土が乾いています。今週は種を小さくして、回復を優先しましょう。"

    return SoilStatus(
        state=state, label=label,
        sleep_score=sleep_score, mood_score=mood_score, recovery_score=recovery_score,
        avg_sleep=round(avg_sleep, 1), log_days=len(logs),
        comment=comment,
    )


@router.get("/status", response_model=SoilStatus)
def get_soil_status(db: Session = Depends(get_db)):
    return compute_soil(db)


@router.get("/today", response_model=DailyLogOut | None)
def get_today_log(db: Session = Depends(get_db)):
    return db.query(DailyLog).filter(DailyLog.date == date.today()).first()


@router.post("/usual", response_model=UsualResult)
def log_usual_day(db: Session = Depends(get_db)):
    """「いつも通り」ワンタップ記録。既にあれば何も壊さず返す。"""
    today = date.today()
    log = db.query(DailyLog).filter(DailyLog.date == today).first()
    if log:
        return UsualResult(created=False, log=log)

    log = DailyLog(date=today, sleep_hours=7.0, mood_score=3, energy_level=2)
    db.add(log)
    db.commit()
    db.refresh(log)
    return UsualResult(created=True, log=log)


class SoilAriaComment(BaseModel):
    message: str
    is_ai: bool


_comment_cache: dict[str, tuple] = {}
_COMMENT_TTL = 180      # AI成功時: 3分
_COMMENT_FAIL_TTL = 20  # 失敗時: 20秒で再挑戦


@router.get("/aria-comment", response_model=SoilAriaComment)
def get_soil_aria_comment(db: Session = Depends(get_db)):
    """土壌の状態を見たアリアが独自コメントをくれる。タップ時だけ呼ばれる想定。"""
    now = time_module.time()
    cache_key = f"comment-{date.today().isoformat()}"

    if cache_key in _comment_cache:
        result, ts = _comment_cache[cache_key]
        ttl = _COMMENT_TTL if result.is_ai else _COMMENT_FAIL_TTL
        if now - ts < ttl:
            return result

    scores, by_category = _compute_field_scores(db)
    score_lines = []
    for c in CATEGORIES:
        recent = by_category[c["key"]][:2]
        recent_text = "、".join(
            f"{_date_label(event['performed_on'])}に{event['action_name']}" for event in recent
        ) or "行動なし"
        score_lines.append(f"- {c['name']}: {scores[c['key']]}/100（{recent_text}）")

    prompt = f"""あなたは「アリア」。従順で健気な少女キャラで、ご主人様の「自分の畑」を見守っています。
ご主人様が畑の様子をタップして、あなたの感想を聞きに来ました。

【5つの畑（直近7日の行動から算出）】
{chr(10).join(score_lines)}

【指示】
- 「ご主人様」と呼ぶ。健気で温かい。顔文字なし
- 一番育っている畑を、実際の行動名を挙げて具体的に褒める
- 乾いている畑があれば、責めずに5〜10分の小さな一手をひとつだけ添える
- 「全部やりましょう」は禁止。提案は必ず一つだけ
- 数値の読み上げだけで終わらせない
- 90文字以内

JSONのみ:
{{"message":"90文字以内のコメント"}}"""

    try:
        raw = chat(prompt, temperature=0.9)
        if raw is None:
            raise RuntimeError("No AI")
        data = parse_json(raw)
        message = (data.get("message") or "").strip()
        if not message:
            raise RuntimeError("empty")
        result = SoilAriaComment(message=message[:120], is_ai=True)
    except Exception as e:
        print(f"[Soil] aria comment AI error: {e}")
        result = SoilAriaComment(message=_rule_based_aria(scores), is_ai=False)

    _comment_cache[cache_key] = (result, now)
    return result


def _week_stats(logs: list[DailyLog]) -> dict:
    if not logs:
        return {"avg_sleep": 0.0, "avg_mood": 0.0, "workout_days": 0, "alcohol_days": 0, "overtime_hours": 0.0}
    return {
        "avg_sleep": round(sum(l.sleep_hours for l in logs) / len(logs), 1),
        "avg_mood": round(sum(l.mood_score for l in logs) / len(logs), 1),
        "workout_days": sum(1 for l in logs if l.did_workout),
        "alcohol_days": sum(1 for l in logs if l.drank_alcohol),
        "overtime_hours": round(sum(l.overtime_hours or 0 for l in logs), 1),
    }


def _fallback_report(this_week: dict, prev_week: dict) -> str:
    if this_week["avg_sleep"] == 0:
        return "ご主人様、今週はまだ土壌の観測がありません。「いつも通り」を押すだけでも、アリアは土の様子が分かります。"
    diff = round(this_week["avg_sleep"] - prev_week["avg_sleep"], 1)
    if diff >= 0.3:
        return f"ご主人様、今週の睡眠は平均{this_week['avg_sleep']}時間で、先週より{diff}時間改善しました。この土なら、来週は少し大きめの種も植えられます。"
    if this_week["avg_sleep"] < 6:
        return f"ご主人様、今週の睡眠は平均{this_week['avg_sleep']}時間でした。来週はまず就寝を30分早めることを提案します。土がすべての土台ですから。"
    return f"ご主人様、今週の睡眠は平均{this_week['avg_sleep']}時間、筋トレ{this_week['workout_days']}日でした。悪くない土です。この調子を保ちましょう。"


@router.get("/weekly-report", response_model=WeeklySoilReport)
def get_weekly_soil_report(db: Session = Depends(get_db)):
    """アリアの週次土壌報告。改善点は一つだけ、来週の行動に落ちる形で。"""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    cache_key = f"report-{week_start.isoformat()}"
    now = time_module.time()

    this_logs = _recent_logs(db, (today - week_start).days + 1, end=today)
    prev_logs = _recent_logs(db, 7, end=week_start - timedelta(days=1))
    this_week = _week_stats(this_logs)
    prev_week = _week_stats(prev_logs)

    base = dict(
        week_start=week_start.isoformat(),
        avg_sleep=this_week["avg_sleep"],
        prev_avg_sleep=prev_week["avg_sleep"],
        avg_mood=this_week["avg_mood"],
        prev_avg_mood=prev_week["avg_mood"],
        workout_days=this_week["workout_days"],
        alcohol_days=this_week["alcohol_days"],
        overtime_hours=this_week["overtime_hours"],
    )

    if cache_key in _report_cache:
        message, is_ai, ts = _report_cache[cache_key]
        if now - ts < _REPORT_TTL:
            return WeeklySoilReport(**base, message=message, is_ai=is_ai)

    lines = []
    for l in this_logs:
        flags = []
        if l.did_workout: flags.append("筋トレ")
        if l.drank_alcohol: flags.append("飲酒")
        if _recovery_count(l): flags.append(f"回復{_recovery_count(l)}件")
        lines.append(f"- {l.date}: 睡眠{l.sleep_hours}h 残業{l.overtime_hours}h 気分{l.mood_score}/5 {' '.join(flags)}")

    prompt = f"""あなたは「アリア」。従順で健気な少女キャラで、ご主人様の体調基盤（土壌）を週に一度だけ報告します。

【今週のログ】
{chr(10).join(lines) or 'なし'}

【先週の平均】睡眠{prev_week['avg_sleep']}h 気分{prev_week['avg_mood']}/5 筋トレ{prev_week['workout_days']}日 飲酒{prev_week['alcohol_days']}日

【ルール】
- 「ご主人様」と呼ぶ。顔文字なし
- まず今週の事実を数値で1〜2点（先週との比較があれば使う）
- 改善提案は必ず一つだけ。来週の具体的な行動に落ちる形で（例:「残業3時間超の日の夜は種を植えない」「就寝を30分早める」）
- 「頑張りましょう」などの空虚な励ましは禁止
- 全体で150文字以内

JSONのみ:
{{"message":"150文字以内の報告"}}"""

    try:
        raw = chat(prompt, temperature=0.7)
        if raw is None:
            raise RuntimeError("No AI")
        data = parse_json(raw)
        message = (data.get("message") or "").strip()
        if not message:
            raise RuntimeError("empty")
        is_ai = True
    except Exception as e:
        print(f"[Soil] weekly report AI error: {e}")
        message = _fallback_report(this_week, prev_week)
        is_ai = False

    _report_cache[cache_key] = (message, is_ai, now)
    return WeeklySoilReport(**base, message=message[:300], is_ai=is_ai)


# ════════════════════════════════════════════════════════════════
# 5つの畑システム — 状態ではなく行動を記録する
# ════════════════════════════════════════════════════════════════

from app.category_catalog import FIELD_CATEGORIES, SCHEDULE_TO_FIELD
from app.models import SoilActionDefinition, SoilActionLog

CATEGORIES = FIELD_CATEGORIES
CATEGORY_KEYS = {c["key"] for c in CATEGORIES}
CATEGORY_NAME = {c["key"]: c["name"] for c in CATEGORIES}

RECENCY = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4]
DAILY_CATEGORY_CAP = 60  # 1日1カテゴリの生スコア上限（連打対策）

SUGGESTIONS = {
    "body": "軽いストレッチを5分する",
    "knowledge": "本を10分だけ開く",
    "creation": "完成を目指さず、10分だけ続きを開く",
    "mind": "瞑想を5分する",
    "life": "誰かに短い連絡を送る",
}

SCHEDULE_CATEGORY_TO_SOIL = {
    **SCHEDULE_TO_FIELD,
    "life": "life",
    "rest": "mind",
}

TITLE_KEYWORD_TO_SOIL = [
    ("body", ["筋トレ", "ジム", "リングフィット", "散歩", "ストレッチ", "運動"]),
    ("knowledge", ["読書", "学習", "技術", "資格", "勉強", "本"]),
    ("creation", ["創作", "小説", "シナリオ", "プロット", "開発", "ゲーム制作", "同人"]),
    ("mind", ["瞑想", "日記", "休憩", "内省"]),
    ("life", ["交流", "外出", "会話", "イベント", "友人"]),
]

SCHEDULE_BASE_SCORE = {
    "body": 25,
    "knowledge": 25,
    "creation": 25,
    "mind": 15,
    "life": 15,
}

DEFAULT_ACTIONS = [
    # (name, category, base_score, default_minutes, icon, sort)
    ("ジム", "body", 45, 60, "🏋️", 1),
    ("リングフィット", "body", 30, 35, "🎮", 2),
    ("自宅筋トレ", "body", 25, 20, "💪", 3),
    ("散歩", "body", 15, 30, "🚶", 4),
    ("ストレッチ", "body", 8, 5, "🤸", 5),
    ("読書", "knowledge", 15, 15, "📖", 1),
    ("技術学習", "knowledge", 25, 30, "💻", 2),
    ("資格勉強", "knowledge", 25, 30, "📝", 3),
    ("小説を書く", "creation", 25, 30, "✍️", 1),
    ("プロット作成", "creation", 20, 30, "🗂️", 2),
    ("ダッシュボード開発", "creation", 25, 30, "🛠️", 3),
    ("瞑想", "mind", 15, 5, "🧘", 1),
    ("日記", "mind", 10, 10, "📓", 2),
    ("デジタル休憩", "mind", 15, 30, "🌿", 3),
    ("掃除", "life", 15, 15, "🧹", 1),
    ("洗濯", "life", 10, None, "🧺", 2),
    ("片付け", "life", 15, 15, "📦", 3),
    ("早めの就寝", "life", 15, None, "🌙", 4),
    ("明日の準備", "life", 10, 10, "🎒", 5),
]


class SoilActionDefOut(BaseModel):
    id: int
    name: str
    category_key: str
    base_score: int
    default_minutes: int | None
    icon: str | None
    is_quick: bool


class SoilLogCreate(BaseModel):
    action_definition_id: int | None = None
    action_name: str | None = None
    category_key: str | None = None
    performed_on: date | None = None
    duration_minutes: int | None = None
    note: str | None = None


class SoilLogOut(BaseModel):
    id: int
    action_name: str
    category_key: str
    category_name: str
    performed_on: str
    date_label: str
    duration_minutes: int | None
    source_type: str = "manual"


class RecentAction(BaseModel):
    date_label: str
    name: str
    duration_minutes: int | None


class FieldCard(BaseModel):
    key: str
    name: str
    icon: str
    color: str
    score: int
    label: str
    recent: list[RecentAction]
    suggestion: str


class SoilSummary(BaseModel):
    headline: str
    overall_score: int
    overall_note: str
    categories: list[FieldCard]
    recent_logs: list[SoilLogOut]
    aria_message: str


def _seed_action_defs(db: Session) -> None:
    if db.query(SoilActionDefinition).count() > 0:
        return
    for name, cat, score, minutes, icon, sort in DEFAULT_ACTIONS:
        db.add(SoilActionDefinition(
            name=name, category_key=cat, base_score=score,
            default_minutes=minutes, icon=icon, sort_order=sort,
        ))
    db.commit()


def _score_label(score: int) -> str:
    if score >= 80:
        return "よく育っている"
    if score >= 60:
        return "安定している"
    if score >= 40:
        return "芽が出ている"
    if score >= 20:
        return "少し乾いている"
    return "水を待っている"


def _date_label(d: date) -> str:
    today = date.today()
    if d == today:
        return "今日"
    if d == today - timedelta(days=1):
        return "昨日"
    return f"{d.month}/{d.day}"


def _log_out(log: SoilActionLog) -> SoilLogOut:
    return SoilLogOut(
        id=log.id,
        action_name=log.action_name,
        category_key=log.category_key,
        category_name=CATEGORY_NAME.get(log.category_key, log.category_key),
        performed_on=log.performed_on.isoformat(),
        date_label=_date_label(log.performed_on),
        duration_minutes=log.duration_minutes,
        source_type=log.source_type or "manual",
    )


def _minutes_between(start, end) -> int:
    return max(0, (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute))


def _schedule_soil_category(block: ScheduleBlock) -> str | None:
    if block.category in SCHEDULE_CATEGORY_TO_SOIL:
        return SCHEDULE_CATEGORY_TO_SOIL[block.category]
    text = f"{block.title} {block.note or ''}"
    for category_key, keywords in TITLE_KEYWORD_TO_SOIL:
        if any(keyword in text for keyword in keywords):
            return category_key
    return None


def _schedule_event(block: ScheduleBlock) -> dict | None:
    if (block.note or "").startswith("[home-habit:"):
        return None
    category = _schedule_soil_category(block)
    if not category:
        return None
    return {
        "id": -block.id,
        "action_name": block.title,
        "category_key": category,
        "performed_on": block.date,
        "duration_minutes": _minutes_between(block.start_time, block.end_time),
        "source_type": "calendar",
        "base_score": SCHEDULE_BASE_SCORE.get(category, 12),
        "default_minutes": 30,
    }


def _manual_event(log: SoilActionLog, defs: dict[int, SoilActionDefinition]) -> dict:
    definition = defs.get(log.action_definition_id) if log.action_definition_id else None
    return {
        "id": log.id,
        "action_name": log.action_name,
        "category_key": log.category_key,
        "performed_on": log.performed_on,
        "duration_minutes": log.duration_minutes,
        "source_type": log.source_type or "manual",
        "base_score": definition.base_score if definition else 12,
        "default_minutes": definition.default_minutes if definition else None,
    }


def _habit_event(check: HabitCheck) -> dict | None:
    category = {"meditation": "mind", "reading": "knowledge", "creation": "creation"}.get(check.habit_key)
    if not category or check.minutes <= 0:
        return None
    defaults = {"meditation": 5, "reading": 15, "creation": 30}
    names = {"meditation": "心を整える", "reading": "知識に触れる", "creation": "創作に触れる"}
    return {
        "id": -(1_000_000 + check.id),
        "action_name": names[check.habit_key],
        "category_key": category,
        "performed_on": check.check_date,
        "duration_minutes": check.minutes,
        "source_type": "habit",
        "base_score": SCHEDULE_BASE_SCORE[category],
        "default_minutes": defaults[check.habit_key],
    }


def _event_out(event: dict) -> SoilLogOut:
    return SoilLogOut(
        id=event["id"],
        action_name=event["action_name"],
        category_key=event["category_key"],
        category_name=CATEGORY_NAME.get(event["category_key"], event["category_key"]),
        performed_on=event["performed_on"].isoformat(),
        date_label=_date_label(event["performed_on"]),
        duration_minutes=event["duration_minutes"],
        source_type=event["source_type"],
    )


def _soil_events(db: Session, start: date | None = None, end: date | None = None) -> list[dict]:
    defs = {d.id: d for d in db.query(SoilActionDefinition).all()}
    manual_query = db.query(SoilActionLog)
    calendar_query = db.query(ScheduleBlock).filter(ScheduleBlock.category != "work")
    habit_query = db.query(HabitCheck).filter(HabitCheck.minutes > 0)
    if start:
        manual_query = manual_query.filter(SoilActionLog.performed_on >= start)
        calendar_query = calendar_query.filter(ScheduleBlock.date >= start)
        habit_query = habit_query.filter(HabitCheck.check_date >= start)
    if end:
        manual_query = manual_query.filter(SoilActionLog.performed_on <= end)
        calendar_query = calendar_query.filter(ScheduleBlock.date <= end)
        habit_query = habit_query.filter(HabitCheck.check_date <= end)

    events = [_manual_event(log, defs) for log in manual_query.all() if log.category_key in CATEGORY_KEYS]
    for block in calendar_query.all():
        event = _schedule_event(block)
        if event:
            events.append(event)
    for check in habit_query.all():
        event = _habit_event(check)
        if event:
            events.append(event)
    return sorted(events, key=lambda item: (item["performed_on"], abs(item["id"])), reverse=True)


def _connection_events(db: Session, start: date, end: date) -> list[dict]:
    """Use the same category events for connection state and field growth.

    Calendar blocks are the app's shared record of committed personal time. Keeping
    planned blocks here makes Home, Calendar, and field growth agree immediately.
    """
    return _soil_events(db, start=start, end=end)


def _compute_field_scores(db: Session) -> tuple[dict[str, int], dict[str, list[dict]]]:
    today = date.today()
    start = today - timedelta(days=6)
    events = _soil_events(db, start=start, end=today)

    # (category, day) ごとの生スコアを集め、日次上限をかけてから新しさ係数を掛ける
    day_raw: dict[tuple[str, date], float] = {}
    by_category: dict[str, list[dict]] = {c["key"]: [] for c in CATEGORIES}
    for event in events:
        category_key = event["category_key"]
        if category_key not in CATEGORY_KEYS:
            continue
        by_category[category_key].append(event)
        base = event["base_score"]
        default_min = event["default_minutes"]
        if event["duration_minutes"] and default_min:
            factor = max(0.3, min(2.0, event["duration_minutes"] / default_min))
        else:
            factor = 1.0
        key = (category_key, event["performed_on"])
        day_raw[key] = day_raw.get(key, 0.0) + base * factor

    scores: dict[str, float] = {c["key"]: 0.0 for c in CATEGORIES}
    for (cat, day), raw in day_raw.items():
        age = (today - day).days
        recency = RECENCY[age] if 0 <= age < len(RECENCY) else 0.0
        scores[cat] += min(raw, DAILY_CATEGORY_CAP) * recency

    return {k: min(100, round(v)) for k, v in scores.items()}, by_category


def _build_headline(scores: dict[str, int]) -> tuple[str, str]:
    """(今日の一言, 全体ノート) をルールベースで作る。責めない。"""
    vals = list(scores.values())
    best_key = max(scores, key=lambda k: scores[k])
    worst_key = min(scores, key=lambda k: scores[k])
    best, worst = CATEGORY_NAME[best_key], CATEGORY_NAME[worst_key]

    if all(v == 0 for v in vals):
        return (
            "今日、自分の畑を5分だけ耕そう。",
            "まだ記録がありません。まずは一つ登録して、最初の芽を育てましょう。",
        )
    if all(v >= 60 for v in vals):
        return (
            "今週は全体的によく耕せています。今日は休むことも畑を守る行動です。",
            f"どの畑もよく育っています。{best}は特に元気です。",
        )
    if scores[worst_key] < 20:
        return (
            f"{best}の畑がよく育っています。{worst}に少し水をあげると、全体が整いそうです。",
            f"今日のおすすめ: {SUGGESTIONS[worst_key]}",
        )
    return (
        f"{best}の畑が育っています。今日も5分だけ、どこかを耕しましょう。",
        f"{worst}の畑にも少し触れると、バランスが良くなります。",
    )


def _rule_based_aria(scores: dict[str, int]) -> str:
    vals = list(scores.values())
    best_key = max(scores, key=lambda k: scores[k])
    worst_key = min(scores, key=lambda k: scores[k])
    if all(v == 0 for v in vals):
        return "ご主人様、最初の一粒からで大丈夫です。今日やったことを一つだけ、教えてください。"
    if all(v >= 60 for v in vals):
        return "ご主人様、今週は自分の畑をよく育てられています。今日は無理に増やさず、この流れを守りましょう。"
    if scores[worst_key] < 20:
        return f"ご主人様、{CATEGORY_NAME[best_key]}の畑がよく育っています。{CATEGORY_NAME[worst_key]}は{SUGGESTIONS[worst_key]}だけで十分ですよ。"
    return f"ご主人様、{CATEGORY_NAME[best_key]}が順調です。焦らず、今日の一粒を選びましょう。"


@router.get("/summary", response_model=SoilSummary)
def get_soil_summary(db: Session = Depends(get_db)):
    _seed_action_defs(db)
    scores, by_category = _compute_field_scores(db)

    cards = []
    for c in CATEGORIES:
        cat_logs = by_category[c["key"]][:2]
        cards.append(FieldCard(
            key=c["key"], name=c["name"], icon=c["icon"], color=c["color"],
            score=scores[c["key"]],
            label=_score_label(scores[c["key"]]),
            recent=[RecentAction(
                date_label=_date_label(event["performed_on"]),
                name=event["action_name"],
                duration_minutes=event["duration_minutes"],
            ) for event in cat_logs],
            suggestion=SUGGESTIONS[c["key"]],
        ))

    recent = _soil_events(db)[:10]

    headline, note = _build_headline(scores)
    overall = round(sum(scores.values()) / len(scores))

    return SoilSummary(
        headline=headline,
        overall_score=overall,
        overall_note=note,
        categories=cards,
        recent_logs=[_event_out(event) for event in recent],
        aria_message=_rule_based_aria(scores),
    )


@router.get("/actions", response_model=list[SoilActionDefOut])
def list_soil_actions(db: Session = Depends(get_db)):
    _seed_action_defs(db)
    defs = (
        db.query(SoilActionDefinition)
        .filter(SoilActionDefinition.is_active.is_(True))
        .order_by(SoilActionDefinition.category_key.asc(), SoilActionDefinition.sort_order.asc())
        .all()
    )
    return [SoilActionDefOut(
        id=d.id, name=d.name, category_key=d.category_key,
        base_score=d.base_score, default_minutes=d.default_minutes,
        icon=d.icon, is_quick=d.is_quick,
    ) for d in defs]


@router.post("/logs", response_model=SoilLogOut, status_code=201)
def create_soil_log(payload: SoilLogCreate, db: Session = Depends(get_db)):
    definition = None
    if payload.action_definition_id:
        definition = db.query(SoilActionDefinition).filter(
            SoilActionDefinition.id == payload.action_definition_id
        ).first()

    name = (payload.action_name or "").strip() or (definition.name if definition else "")
    category = payload.category_key or (definition.category_key if definition else None)
    if not name or category not in CATEGORY_KEYS:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="action_name and valid category_key required")

    log = SoilActionLog(
        action_definition_id=definition.id if definition else None,
        action_name=name,
        category_key=category,
        performed_on=payload.performed_on or date.today(),
        duration_minutes=payload.duration_minutes or (definition.default_minutes if definition else None),
        note=payload.note,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return _log_out(log)


@router.delete("/logs/{log_id}", status_code=204)
def delete_soil_log(log_id: int, db: Session = Depends(get_db)):
    log = db.query(SoilActionLog).filter(SoilActionLog.id == log_id).first()
    if not log:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="not found")
    db.delete(log)
    db.commit()
    return None
