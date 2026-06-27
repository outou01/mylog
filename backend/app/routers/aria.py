import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import DailyLog, AiReview

router = APIRouter(prefix="/aria", tags=["aria"])


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

    # 睡眠
    if log.sleep_hours < 5.5:
        parts.append(f"ご主人様、睡眠が{log.sleep_hours}時間というのは正直かなり少ないです。体は正直で、積み重なると判断力や気力に響いてきます。今夜だけでも早く横になってほしいです。")
        mood = "worried"
    elif log.sleep_hours >= 7:
        parts.append(f"ご主人様、睡眠{log.sleep_hours}時間しっかり確保できましたね。アリアも安心です！")
        mood = "happy"

    # 残業
    if log.overtime_hours >= 3:
        parts.append(f"残業{log.overtime_hours}時間は消耗します、ご主人様。仕事の量は変えられなくても、今夜の過ごし方で回復できます。")
        mood = "worried"

    # 達成
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

    # 気分
    if log.mood_score <= 2:
        parts.append("気分スコアが低い日は、無理に前向きにならなくていいと思います、ご主人様。ただそこにいるだけで、ちゃんと記録していることがアリアには伝わっています。")
        mood = "worried"

    # 連続パターンを見る
    if len(recent_logs) >= 3:
        workout_streak = sum(1 for l in recent_logs[-3:] if l.did_workout)
        if workout_streak == 3:
            parts.append("ここ3日連続で筋トレしているの、アリアはちゃんと見てましたよ、ご主人様！")
            mood = "proud"

    if not parts:
        parts.append("ご主人様、今日も記録してくれましたね。それだけで自分と向き合えている証拠です。")
        mood = "happy"

    return AriaMessage(message=" ".join(parts[:2]), mood=mood)


def _openai_aria(log: DailyLog | None, recent_logs: list[DailyLog]) -> AriaMessage:
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)

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

    res = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
    )
    raw = res.choices[0].message.content or "{}"
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    data = json.loads(raw)
    return AriaMessage(message=data.get("message", ""), mood=data.get("mood", "normal"))


@router.get("/message", response_model=AriaMessage)
def get_aria_message(db: Session = Depends(get_db)):
    today = date.today()
    log = db.query(DailyLog).filter(DailyLog.date == today).first()

    recent_logs = (
        db.query(DailyLog)
        .filter(DailyLog.date >= today - timedelta(days=7), DailyLog.date < today)
        .order_by(DailyLog.date.asc())
        .all()
    )

    try:
        if settings.openai_api_key:
            return _openai_aria(log, recent_logs)
        else:
            return _fallback(log, recent_logs)
    except Exception as e:
        import traceback
        print(f"[Aria] OpenAI error: {e}")
        traceback.print_exc()
        return _fallback(log, recent_logs)
