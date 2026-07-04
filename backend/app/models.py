from datetime import date, datetime, time as time_type
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DailyLog(Base):
    __tablename__ = "daily_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    sleep_hours: Mapped[float] = mapped_column(Float, nullable=False)
    overtime_hours: Mapped[float] = mapped_column(Float, default=0.0)
    mood_score: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5
    did_workout: Mapped[bool] = mapped_column(Boolean, default=False)
    did_create: Mapped[bool] = mapped_column(Boolean, default=False)
    did_code: Mapped[bool] = mapped_column(Boolean, default=False)
    drank_alcohol: Mapped[bool] = mapped_column(Boolean, default=False)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)

    # エネルギー管理フィールド
    energy_level: Mapped[int] = mapped_column(Integer, default=2)  # 1=疲れた 2=普通 3=元気
    day_type: Mapped[str] = mapped_column(String(20), default="advance")  # advance/recovery/maintenance
    did_job_search: Mapped[bool] = mapped_column(Boolean, default=False)
    did_study: Mapped[bool] = mapped_column(Boolean, default=False)

    # 回復ポイント
    went_outside: Mapped[bool] = mapped_column(Boolean, default=False)
    ate_good_food: Mapped[bool] = mapped_column(Boolean, default=False)
    took_walk: Mapped[bool] = mapped_column(Boolean, default=False)
    visited_cafe: Mapped[bool] = mapped_column(Boolean, default=False)
    visited_akihabara: Mapped[bool] = mapped_column(Boolean, default=False)
    napped: Mapped[bool] = mapped_column(Boolean, default=False)
    played_games: Mapped[bool] = mapped_column(Boolean, default=False)
    talked_with_friends: Mapped[bool] = mapped_column(Boolean, default=False)
    did_nothing: Mapped[bool] = mapped_column(Boolean, default=False)

    # 活動時間（時間単位）
    create_hours: Mapped[float] = mapped_column(Float, default=0.0)
    workout_hours: Mapped[float] = mapped_column(Float, default=0.0)
    study_hours: Mapped[float] = mapped_column(Float, default=0.0)
    code_hours: Mapped[float] = mapped_column(Float, default=0.0)
    job_search_hours: Mapped[float] = mapped_column(Float, default=0.0)

    # 発散・勝利条件
    discharge_activities: Mapped[str | None] = mapped_column(Text, nullable=True)
    victory_condition: Mapped[str | None] = mapped_column(Text, nullable=True)
    victory_achieved: Mapped[bool] = mapped_column(Boolean, default=False)

    # パチンコ分析
    pachinko_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    pachinko_feeling_after: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pachinko_creation_minutes_after: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    ai_review: Mapped["AiReview | None"] = relationship("AiReview", back_populates="daily_log", uselist=False)


class AiReview(Base):
    __tablename__ = "ai_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    daily_log_id: Mapped[int] = mapped_column(Integer, ForeignKey("daily_logs.id"), unique=True, nullable=False)
    hp: Mapped[int] = mapped_column(Integer)
    mp: Mapped[int] = mapped_column(Integer)
    stress: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text)
    next_action: Mapped[str] = mapped_column(Text)
    encouragement: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    daily_log: Mapped["DailyLog"] = relationship("DailyLog", back_populates="ai_review")


class MonthlyTheme(Base):
    __tablename__ = "monthly_themes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    month: Mapped[str] = mapped_column(String(7), unique=True, nullable=False)  # YYYY-MM
    theme_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class WeekendNote(Base):
    __tablename__ = "weekend_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    week_start: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    next_action: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DashboardSetting(Base):
    __tablename__ = "dashboard_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class ActiveProject(Base):
    __tablename__ = "active_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    last_touched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    next_action: Mapped[str] = mapped_column(Text, nullable=False)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    events: Mapped[list["ActiveProjectEvent"]] = relationship(
        "ActiveProjectEvent",
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ActiveProjectEvent(Base):
    __tablename__ = "active_project_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("active_projects.id"), nullable=False, index=True)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project: Mapped["ActiveProject"] = relationship("ActiveProject", back_populates="events")


class ScheduleBlock(Base):
    __tablename__ = "schedule_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time_type] = mapped_column(Time, nullable=False)
    end_time: Mapped[time_type] = mapped_column(Time, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(40), default="self", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
