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
    energy_level: int = Field(ge=1, le=3, default=2)
    day_type: str = "advance"
    did_job_search: bool = False
    did_study: bool = False
    went_outside: bool = False
    ate_good_food: bool = False
    took_walk: bool = False
    visited_cafe: bool = False
    visited_akihabara: bool = False
    napped: bool = False
    played_games: bool = False
    talked_with_friends: bool = False
    did_nothing: bool = False
    discharge_activities: str | None = None
    victory_condition: str | None = None
    victory_achieved: bool = False
    create_hours: float = 0.0
    workout_hours: float = 0.0
    study_hours: float = 0.0
    code_hours: float = 0.0
    job_search_hours: float = 0.0
    pachinko_reason: str | None = None
    pachinko_feeling_after: str | None = None
    pachinko_creation_minutes_after: int | None = None


class DailyLogUpdate(BaseModel):
    sleep_hours: float | None = Field(None, ge=0, le=24)
    overtime_hours: float | None = Field(None, ge=0)
    mood_score: int | None = Field(None, ge=1, le=5)
    did_workout: bool | None = None
    did_create: bool | None = None
    did_code: bool | None = None
    drank_alcohol: bool | None = None
    memo: str | None = None
    energy_level: int | None = Field(None, ge=1, le=3)
    day_type: str | None = None
    did_job_search: bool | None = None
    did_study: bool | None = None
    went_outside: bool | None = None
    ate_good_food: bool | None = None
    took_walk: bool | None = None
    visited_cafe: bool | None = None
    visited_akihabara: bool | None = None
    napped: bool | None = None
    played_games: bool | None = None
    talked_with_friends: bool | None = None
    did_nothing: bool | None = None
    discharge_activities: str | None = None
    victory_condition: str | None = None
    victory_achieved: bool | None = None
    create_hours: float | None = None
    workout_hours: float | None = None
    study_hours: float | None = None
    code_hours: float | None = None
    job_search_hours: float | None = None
    pachinko_reason: str | None = None
    pachinko_feeling_after: str | None = None
    pachinko_creation_minutes_after: int | None = None


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
    energy_level: int
    day_type: str
    did_job_search: bool
    did_study: bool
    went_outside: bool
    ate_good_food: bool
    took_walk: bool
    visited_cafe: bool
    visited_akihabara: bool
    napped: bool
    played_games: bool
    talked_with_friends: bool
    did_nothing: bool
    discharge_activities: str | None
    victory_condition: str | None
    victory_achieved: bool
    create_hours: float
    workout_hours: float
    study_hours: float
    code_hours: float
    job_search_hours: float
    pachinko_reason: str | None
    pachinko_feeling_after: str | None
    pachinko_creation_minutes_after: int | None
    created_at: datetime
    updated_at: datetime
    ai_review: AiReviewOut | None = None

    model_config = {"from_attributes": True}
