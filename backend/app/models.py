from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
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
