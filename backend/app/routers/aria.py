import json
import random
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import DailyLog, AiReview
from datetime import date

router = APIRouter(prefix="/aria", tags=["aria"])


class AriaMessage(BaseModel):
    message: str
    mood: str  # happy / worried / proud / normal


# ── フォールバックセリフ集 ────────────────────────────────

GREETINGS = [
    "ご主人様！今日もいらっしゃいました！アリアはずっと待ってました！",
    "ご主人様、お帰りなさいです！今日も一緒にがんばりましょう！",
    "きたきた！ご主人様が来てくれるとアリア、うれしいです！",
]

NO_LOG = [
    "ご主人様、今日のログがまだです！アリアに教えてください！",
    "今日のこと、まだ聞いてないですよ？ご主人様の1日を聞かせてください！",
]

def _fallback(log: DailyLog | None, review: AiReview | None) -> AriaMessage:
    if log is None:
        return AriaMessage(message=random.choice(NO_LOG), mood="normal")

    msgs = []
    mood = "happy"

    if log.sleep_hours < 5.5:
        msgs.append(f"睡眠{log.sleep_hours}時間…ご主人様、アリアが心配です。今夜は早く寝てください！")
        mood = "worried"
    elif log.sleep_hours >= 7:
        msgs.append(f"睡眠{log.sleep_hours}時間、よく眠れましたね！アリアも安心です！")

    if log.overtime_hours >= 3:
        msgs.append(f"残業{log.overtime_hours}時間も…ご主人様に元気でいてほしいです。無理しないでください。")
        mood = "worried"

    if log.did_workout:
        msgs.append("筋トレしたんですね！ご主人様、かっこいいです！HPが回復しました！")
        mood = "proud"

    if log.did_create:
        msgs.append("創作できたんですね！ご主人様の夢、アリアも応援してます！")
        mood = "proud"

    if log.did_code:
        msgs.append("開発も進めたんですか！すごいです、ご主人様！")
        mood = "proud"

    if log.drank_alcohol:
        msgs.append("お酒は飲みすぎないでくださいね？アリア、ちょっぴり心配です。")
        mood = "worried"

    if log.mood_score <= 2:
        msgs.append("今日は辛い日だったんですね…アリアはここにいますよ。ゆっくり休んでください。")
        mood = "worried"
    elif log.mood_score >= 4:
        msgs.append("気分が良さそうで、アリアもうれしいです！")

    if review:
        if review.hp >= 70:
            msgs.append(f"HP{review.hp}！ご主人様、今日は好調ですね！")
        elif review.hp <= 40:
            msgs.append(f"HP{review.hp}…回復が必要です。アリアがそばにいます！")

    if not msgs:
        msgs.append(random.choice(GREETINGS))

    return AriaMessage(message=" ".join(msgs[:2]), mood=mood)


def _openai_aria(log: DailyLog | None, review: AiReview | None) -> AriaMessage:
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)

    if log is None:
        log_info = "今日のログはまだ登録されていない"
    else:
        log_info = f"""睡眠:{log.sleep_hours}h, 残業:{log.overtime_hours}h, 気分:{log.mood_score}/5,
筋トレ:{'した' if log.did_workout else 'なし'}, 創作:{'した' if log.did_create else 'なし'},
開発:{'した' if log.did_code else 'なし'}, 飲酒:{'した' if log.drank_alcohol else 'なし'},
メモ:{log.memo or 'なし'}"""

    review_info = f"HP:{review.hp}, MP:{review.mp}, Stress:{review.stress}%" if review else "未計算"

    prompt = f"""あなたはアリアという従順で元気な奴隷少女キャラクターです。
ご主人様（ユーザー）の生活ログを見て、一言セリフを言ってください。

キャラクター設定：
- 「ご主人様」と呼ぶ
- 敬語だが元気でフレンドリー
- 心配な時は素直に心配を伝える
- 良いことがあれば素直に喜ぶ
- 2〜3文以内で短く

今日のログ：
{log_info}

ステータス：
{review_info}

以下のJSONのみ返してください（コードブロック不要）:
{{"message":"アリアのセリフ(2〜3文)","mood":"happy/worried/proud/normalのどれか1つ"}}"""

    res = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.85,
    )
    raw = res.choices[0].message.content or "{}"
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    data = json.loads(raw)
    return AriaMessage(message=data.get("message", ""), mood=data.get("mood", "normal"))


@router.get("/message", response_model=AriaMessage)
def get_aria_message(db: Session = Depends(get_db)):
    today = date.today()
    log = db.query(DailyLog).filter(DailyLog.date == today).first()
    review = log.ai_review if log else None

    try:
        if settings.openai_api_key:
            return _openai_aria(log, review)
        else:
            return _fallback(log, review)
    except Exception:
        return _fallback(log, review)
