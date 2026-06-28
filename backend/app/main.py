from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.database import Base, engine
from app.routers import ai_reviews, aria, briefing, daily_logs, quick_log, weekly_report

Base.metadata.create_all(bind=engine)

# 既存テーブルへの新カラム追加マイグレーション
def _migrate():
    inspector = inspect(engine)
    existing = {c["name"] for c in inspector.get_columns("daily_logs")}
    new_cols = [
        ("energy_level", "INTEGER DEFAULT 2"),
        ("day_type", "VARCHAR(20) DEFAULT 'advance'"),
        ("did_job_search", "BOOLEAN DEFAULT FALSE"),
        ("did_study", "BOOLEAN DEFAULT FALSE"),
        ("went_outside", "BOOLEAN DEFAULT FALSE"),
        ("ate_good_food", "BOOLEAN DEFAULT FALSE"),
        ("took_walk", "BOOLEAN DEFAULT FALSE"),
        ("visited_cafe", "BOOLEAN DEFAULT FALSE"),
        ("visited_akihabara", "BOOLEAN DEFAULT FALSE"),
        ("napped", "BOOLEAN DEFAULT FALSE"),
        ("played_games", "BOOLEAN DEFAULT FALSE"),
        ("talked_with_friends", "BOOLEAN DEFAULT FALSE"),
        ("did_nothing", "BOOLEAN DEFAULT FALSE"),
        ("discharge_activities", "TEXT"),
        ("victory_condition", "TEXT"),
        ("victory_achieved", "BOOLEAN DEFAULT FALSE"),
    ]
    with engine.connect() as conn:
        for col_name, col_def in new_cols:
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE daily_logs ADD COLUMN {col_name} {col_def}"))
        conn.commit()

_migrate()

app = FastAPI(title="AI Life Console API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(daily_logs.router)
app.include_router(ai_reviews.router)
app.include_router(quick_log.router)
app.include_router(weekly_report.router)
app.include_router(briefing.router)
app.include_router(aria.router)


@app.get("/health")
def health():
    return {"status": "ok"}
