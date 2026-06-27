import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import AiReview, DailyLog
from app.schemas import AiReviewOut

router = APIRouter(prefix="/ai-review", tags=["ai-review"])


def _calc_stats(log: DailyLog) -> tuple[int, int, int]:
    """Calculate HP/MP/Stress from log data without AI."""
    hp = 50 + (log.sleep_hours - 6) * 8
    hp += 10 if log.did_workout else 0
    hp = max(0, min(100, int(hp)))

    mp = 50 - log.overtime_hours * 5
    mp += 8 if log.did_code else 0
    mp += 5 if log.did_create else 0
    mp = max(0, min(100, int(mp)))

    stress = 50 + (log.overtime_hours * 5) + ((3 - log.mood_score) * 8)
    stress -= 10 if log.did_workout else 0
    stress += 10 if log.drank_alcohol else 0
    stress = max(0, min(100, int(stress)))

    return hp, mp, stress


def _generate_review_fallback(log: DailyLog) -> dict:
    hp, mp, stress = _calc_stats(log)
    comment = "今日のログを確認しました。"
    if log.overtime_hours >= 3:
        comment += f"残業{log.overtime_hours}時間は体への負担が大きいです。"
    if log.sleep_hours < 6:
        comment += f"睡眠{log.sleep_hours}時間は不足気味です。"
    if log.mood_score <= 2:
        comment += "気分が低めの日でしたね。"

    next_action = "明日は" + ("早めに休んで睡眠を確保しましょう。" if log.sleep_hours < 6 else "今日の調子を維持してください。")
    encouragement = "記録しているだけで、自分と向き合えています。それだけで十分です。"

    return {"hp": hp, "mp": mp, "stress": stress, "comment": comment,
            "next_action": next_action, "encouragement": encouragement}


def _generate_review_openai(log: DailyLog) -> dict:
    from openai import OpenAI
    hp, mp, stress = _calc_stats(log)
    client = OpenAI(api_key=settings.openai_api_key)

    prompt = f"""以下は今日の生活ログです。日本語で短く返してください。

日付: {log.date}
睡眠: {log.sleep_hours}時間
残業: {log.overtime_hours}時間
気分スコア: {log.mood_score}/5
筋トレ: {'した' if log.did_workout else 'しなかった'}
創作: {'した' if log.did_create else 'しなかった'}
Web開発: {'した' if log.did_code else 'しなかった'}
飲酒: {'した' if log.drank_alcohol else 'しなかった'}
メモ: {log.memo or 'なし'}

HP={hp}, MP={mp}, Stress={stress}%

以下のJSONのみ返してください（コードブロック不要）:
{{"comment": "今日の状態コメント(2文程度)", "next_action": "明日のおすすめ行動(1文)", "encouragement": "励ましの一言(1文)"}}"""

    response = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )
    text = response.choices[0].message.content or "{}"
    data = json.loads(text)
    return {"hp": hp, "mp": mp, "stress": stress, **data}


@router.post("/{daily_log_id}", response_model=AiReviewOut, status_code=201)
def create_ai_review(daily_log_id: int, db: Session = Depends(get_db)):
    log = db.query(DailyLog).filter(DailyLog.id == daily_log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    if log.ai_review:
        db.delete(log.ai_review)
        db.commit()

    try:
        if settings.openai_api_key:
            data = _generate_review_openai(log)
        else:
            data = _generate_review_fallback(log)
    except Exception:
        data = _generate_review_fallback(log)

    review = AiReview(daily_log_id=daily_log_id, **data)
    db.add(review)
    db.commit()
    db.refresh(review)
    return review
