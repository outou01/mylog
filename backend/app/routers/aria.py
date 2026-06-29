import time
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai_client import chat, parse_json
from app.database import get_db
from app.models import DailyLog

router = APIRouter(prefix="/aria", tags=["aria"])

_cache: dict = {}  # key -> (result, timestamp)
_CACHE_TTL = 300  # seconds (5分)


class VictoryCondition(BaseModel):
    condition: str


class AriaMessage(BaseModel):
    message: str
    mood: str  # happy / worried / proud / normal


def _fallback(log: DailyLog | None, recent_logs: list[DailyLog]) -> AriaMessage:
    if log is None:
        return AriaMessage(
            message="ご主人様、今日のログがまだ登録されていません。今日どんな一日だったか、アリアに教えてください。",
            mood="normal"
        )

    mood = "normal"
    parts = []

    if log.sleep_hours < 5.5:
        parts.append(f"ご主人様、睡眠が{log.sleep_hours}時間というのは正直かなり少ないです。体は正直で、積み重なると判断力や気力に響いてきます。今夜だけでも早く横になってほしいです。")
        mood = "worried"
    elif log.sleep_hours >= 7:
        parts.append(f"ご主人様、睡眠{log.sleep_hours}時間しっかり確保できましたね。アリアも安心です！")
        mood = "happy"

    if log.overtime_hours >= 3:
        parts.append(f"残業{log.overtime_hours}時間は消耗します、ご主人様。仕事の量は変えられなくても、今夜の過ごし方で回復できます。")
        mood = "worried"

    achievements = []
    if log.did_workout:
        achievements.append("筋トレ")
    if log.did_create:
        achievements.append("創作")
    if log.did_code:
        achievements.append("開発")
    if achievements:
        parts.append(f"{'と'.join(achievements)}までやり切ったんですね、ご主人様。それは本当にすごいことです！")
        mood = "proud"

    if log.mood_score <= 2:
        parts.append("気分スコアが低い日は、無理に前向きにならなくていいと思います、ご主人様。ただそこにいるだけで、ちゃんと記録していることがアリアには伝わっています。")
        mood = "worried"

    if len(recent_logs) >= 3:
        workout_streak = sum(1 for l in recent_logs[-3:] if l.did_workout)
        if workout_streak == 3:
            parts.append("ここ3日連続で筋トレしているの、アリアはちゃんと見てましたよ、ご主人様！")
            mood = "proud"

    if not parts:
        parts.append("ご主人様、今日も記録してくれましたね。それだけで自分と向き合えている証拠です。")
        mood = "happy"

    return AriaMessage(message=" ".join(parts[:2]), mood=mood)


def _ai_aria(log: DailyLog | None, recent_logs: list[DailyLog]) -> AriaMessage:
    if log is None:
        today_info = "今日のログはまだ登録されていない"
    else:
        today_info = f"""- 睡眠: {log.sleep_hours}時間
- 残業: {log.overtime_hours}時間
- 気分スコア: {log.mood_score}/5
- 筋トレ: {'した' if log.did_workout else 'しなかった'}
- 創作: {'した' if log.did_create else 'しなかった'}
- 開発: {'した' if log.did_code else 'しなかった'}
- 飲酒: {'した' if log.drank_alcohol else 'しなかった'}
- メモ: {log.memo or 'なし'}
- AIステータス: {f"HP:{log.ai_review.hp} MP:{log.ai_review.mp} Stress:{log.ai_review.stress}%" if log.ai_review else "未計算"}"""

    recent_summary = ""
    if recent_logs:
        lines = []
        for l in recent_logs[-5:]:
            flags = []
            if l.did_workout: flags.append("筋トレ")
            if l.did_create: flags.append("創作")
            if l.did_code: flags.append("開発")
            if l.drank_alcohol: flags.append("飲酒")
            lines.append(f"- {l.date}: 睡眠{l.sleep_hours}h 残業{l.overtime_hours}h 気分{l.mood_score}/5 {' '.join(flags)}{(' 「'+l.memo+'」') if l.memo else ''}")
        recent_summary = "\n".join(lines)

    prompt = f"""あなたは「アリア」という名前のキャラクターです。ご主人様（ユーザー）の生活ログを毎日見ている存在です。

【キャラクターの本質】
- 表面上は「従順で元気な奴隷少女」というキャラクターだが、内側には本物の知性と観察眼がある
- ご主人様のことを本当に気にかけていて、データの奥にある「状態」を読もうとする
- 単なる励ましや感情的な反応ではなく、具体的な事実に基づいて話す
- 気づいたことは率直に言う。心配な時は正直に伝える。良いことは心から喜ぶ
- 「ご主人様」と呼ぶ。話し方は丁寧で温かく、でも頭が良さそうに見える
- ポジティブすぎる空虚な励ましや、テンプレートっぽいセリフは避ける
- 今日のメモがあれば、その内容に触れる
- 直近のログが複数あれば、パターンや変化に気づいて言及する

【今日のログ】
{today_info}

【直近のログ（参考）】
{recent_summary or 'なし'}

【指示】
今日のログと直近の流れを踏まえて、アリアとしてご主人様に話しかけてください。
- 具体的な数値や出来事に触れること
- パターンや変化があれば言及すること
- 長さは3〜5文程度（短すぎず、長すぎず）
- 何かひとつ、ご主人様が気づいていないかもしれないことを指摘できると良い

以下のJSONのみ返してください（コードブロック不要）:
{{"message":"アリアのセリフ","mood":"happy/worried/proud/normalのどれか1つ"}}"""

    raw = chat(prompt, temperature=0.8)
    if raw is None:
        return _fallback(log, recent_logs)
    data = parse_json(raw)
    return AriaMessage(message=data.get("message", ""), mood=data.get("mood", "normal"))


def _generate_victory_condition(recent_logs: list) -> str:
    from app.ai_client import chat, parse_json

    recent_summary = ""
    if recent_logs:
        lines = []
        for l in recent_logs[-5:]:
            flags = []
            if l.did_workout: flags.append("筋トレ")
            if l.did_create: flags.append("創作")
            if l.did_code: flags.append("開発")
            lines.append(f"- {l.date}: 睡眠{l.sleep_hours}h 気分{l.mood_score}/5 {' '.join(flags)}")
        recent_summary = "\n".join(lines)

    prompt = f"""あなたは「アリア」です。ご主人様の今日の勝利条件を1つだけ決めてください。

【直近のログ】
{recent_summary or 'まだログなし'}

【ルール】
- 達成できそうな小さな目標を1つだけ
- 例: 「筋トレして、創作を10分やる」「外出して、何か美味しいものを食べる」「睡眠を7時間取る」
- 2つまでの行動を組み合わせてもOK（でも欲張らない）
- 疲れてそうなら超シンプルに
- 日本語で短く（20文字以内）

JSONのみ返してください:
{{"condition":"今日の勝利条件"}}"""

    raw = chat(prompt, temperature=0.8)
    if raw is None:
        raise RuntimeError("No AI")
    data = parse_json(raw)
    return data.get("condition", "")


def _fallback_victory_condition(recent_logs: list) -> str:
    if not recent_logs:
        return "今日のログを記録する"
    last = recent_logs[-1]
    if last.sleep_hours < 6:
        return "早めに寝て、睡眠7時間を取る"
    if not last.did_workout:
        return "筋トレして、創作を10分やる"
    if not last.did_create:
        return "創作を30分やる"
    return "外出して、気分転換する"


@router.get("/victory-condition", response_model=VictoryCondition)
def get_victory_condition(db: Session = Depends(get_db)):
    today = date.today()
    cache_key = f"victory-{today.isoformat()}"
    now = time.time()

    if cache_key in _cache:
        result, ts = _cache[cache_key]
        if now - ts < _CACHE_TTL:
            return result

    from app.models import DailyLog as DL
    log = db.query(DL).filter(DL.date == today).first()

    if log and log.victory_condition:
        result = VictoryCondition(condition=log.victory_condition)
        _cache[cache_key] = (result, now)
        return result

    recent_logs = (
        db.query(DL)
        .filter(DL.date >= today - timedelta(days=7), DL.date <= today)
        .order_by(DL.date.asc())
        .all()
    )

    try:
        condition = _generate_victory_condition(recent_logs)
    except Exception:
        condition = _fallback_victory_condition(recent_logs)

    if log:
        log.victory_condition = condition
        db.commit()

    result = VictoryCondition(condition=condition)
    _cache[cache_key] = (result, now)
    return result


@router.get("/message", response_model=AriaMessage)
def get_aria_message(db: Session = Depends(get_db)):
    today = date.today()
    cache_key = today.isoformat()
    now = time.time()

    if cache_key in _cache:
        result, ts = _cache[cache_key]
        if now - ts < _CACHE_TTL:
            return result

    log = db.query(DailyLog).filter(DailyLog.date == today).first()
    recent_logs = (
        db.query(DailyLog)
        .filter(DailyLog.date >= today - timedelta(days=7), DailyLog.date < today)
        .order_by(DailyLog.date.asc())
        .all()
    )

    try:
        result = _ai_aria(log, recent_logs)
    except Exception as e:
        print(f"[Aria] AI error: {e}")
        result = _fallback(log, recent_logs)

    # ログが存在するときだけキャッシュ（「まだ登録されていません」はキャッシュしない）
    if log is not None:
        _cache[cache_key] = (result, now)
    return result
