from datetime import date, datetime
from pydantic import BaseModel, Field


class DailyLogCreate(BaseModel):
    date: date
    sleep_hours: float = Field(ge=0, le=24)
    overtime_hours: float = Field(ge=0, default=0.0)
    mood_score: int = Field(ge=1, le=5)
    did_workout: bool = False
    did_create: bool = False
    did_code: bool = False
    drank_alcohol: bool = False
    memo: str | None = None


class DailyLogUpdate(BaseModel):
    sleep_hours: float | None = Field(None, ge=0, le=24)
    overtime_hours: float | None = Field(None, ge=0)
    mood_score: int | None = Field(None, ge=1, le=5)
    did_workout: bool | None = None
    did_create: bool | None = None
    did_code: bool | None = None
    drank_alcohol: bool | None = None
    memo: str | None = None


class AiReviewOut(BaseModel):
    id: int
    daily_log_id: int
    hp: int
    mp: int
    stress: int
    comment: str
    next_action: str
    encouragement: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DailyLogOut(BaseModel):
    id: int
    date: date
    sleep_hours: float
    overtime_hours: float
    mood_score: int
    did_workout: bool
    did_create: bool
    did_code: bool
    drank_alcohol: bool
    memo: str | None
    created_at: datetime
    updated_at: datetime
    ai_review: AiReviewOut | None = None

    model_config = {"from_attributes": True}
