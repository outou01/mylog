from datetime import date, datetime, time as time_type
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, Time, UniqueConstraint, func
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
    dream_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("dreams.id"), nullable=True, index=True)
    project_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("dream_projects.id"), nullable=True, index=True)
    seed_task_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("seed_tasks.id"), nullable=True, index=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Dream(Base):
    __tablename__ = "dreams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(20), nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    linked_project_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    projects: Mapped[list["DreamProject"]] = relationship(
        "DreamProject",
        back_populates="dream",
        cascade="all, delete-orphan",
        foreign_keys="DreamProject.dream_id",
    )
    seeds: Mapped[list["SeedTask"]] = relationship("SeedTask", back_populates="dream", cascade="all, delete-orphan")


class DreamProject(Base):
    __tablename__ = "dream_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    dream_id: Mapped[int] = mapped_column(Integer, ForeignKey("dreams.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_position: Mapped[str | None] = mapped_column(Text, nullable=True)
    steps: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    dream: Mapped["Dream"] = relationship("Dream", back_populates="projects", foreign_keys=[dream_id])
    seeds: Mapped[list["SeedTask"]] = relationship("SeedTask", back_populates="project", cascade="all, delete-orphan")


class SeedTask(Base):
    __tablename__ = "seed_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    parent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("seed_tasks.id"), nullable=True, index=True)
    dream_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("dreams.id"), nullable=True, index=True)
    project_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("dream_projects.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    priority: Mapped[str | None] = mapped_column(String(20), nullable=True)
    depth: Mapped[int] = mapped_column(Integer, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    section: Mapped[str | None] = mapped_column(String(80), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    importance: Mapped[str | None] = mapped_column(Text, nullable=True)
    concern: Mapped[str | None] = mapped_column(Text, nullable=True)
    motivation: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=30)
    actual_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    dream: Mapped["Dream | None"] = relationship("Dream", back_populates="seeds")
    project: Mapped["DreamProject | None"] = relationship("DreamProject", back_populates="seeds")


class ScheduleMessage(Base):
    __tablename__ = "schedule_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_date: Mapped[date] = mapped_column(Date, unique=True, nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_fallback: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class TimeAnalysisComment(Base):
    __tablename__ = "time_analysis_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    scope: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    is_fallback: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class SoilActionDefinition(Base):
    __tablename__ = "soil_action_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category_key: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # body/knowledge/creation/mind/life
    base_score: Mapped[int] = mapped_column(Integer, default=10)
    default_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_quick: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class SoilActionLog(Base):
    __tablename__ = "soil_action_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    action_definition_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("soil_action_definitions.id"), nullable=True, index=True)
    action_name: Mapped[str] = mapped_column(String(120), nullable=False)
    category_key: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    performed_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_type: Mapped[str] = mapped_column(String(20), default="manual")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class HabitCheck(Base):
    __tablename__ = "habit_checks"
    __table_args__ = (UniqueConstraint("habit_key", "check_date", name="uq_habit_check_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    habit_key: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    check_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    minutes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class InsightSeed(Base):
    __tablename__ = "insight_seeds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    insight: Mapped[str] = mapped_column(Text, nullable=False)
    personal_rule: Mapped[str] = mapped_column(Text, nullable=False)
    linked_actions: Mapped[str] = mapped_column(String(240), nullable=False, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
