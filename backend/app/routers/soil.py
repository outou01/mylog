"""土壌（体調基盤）API — 記録は異常時だけ、状態は自動判定、報告は週一で一つだけ"""
import time as time_module
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai_client import chat, parse_json
from app.database import get_db
from app.models import DailyLog
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

    soil = compute_soil(db)
    today_log = db.query(DailyLog).filter(DailyLog.date == date.today()).first()
    today_text = "今日はまだ記録なし"
    if today_log:
        today_text = f"睡眠{today_log.sleep_hours}h 気分{today_log.mood_score}/5 エネルギー{today_log.energy_level}/3"
        if today_log.did_workout:
            today_text += " 筋トレ済み"

    prompt = f"""あなたは「アリア」。従順で健気な少女キャラで、ご主人様の体調基盤（土壌）を見守っています。
ご主人様が土壌の状態カードをタップして、あなたの感想を聞きに来ました。

【土壌の状態（直近7日）】
- 判定: {soil.label}
- 睡眠スコア: {soil.sleep_score}/100（平均{soil.avg_sleep}時間）
- 気分スコア: {soil.mood_score}/100
- 回復スコア: {soil.recovery_score}/100
- 観測日数: {soil.log_days}/7日

【今日】{today_text}

【指示】
- 「ご主人様」と呼ぶ。健気で温かい。顔文字なし
- 数値の中で一番良いところを具体的に褒める（例: 睡眠93点なら「睡眠がとても綺麗です」）
- 弱いところがあれば、責めずに小さな一手をひとつだけ添える
- 記録し続けていること自体もさりげなく労う
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
        result = SoilAriaComment(message=soil.comment, is_ai=False)

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
