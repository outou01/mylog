from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import ai_reviews, briefing, daily_logs, quick_log, weekly_report

Base.metadata.create_all(bind=engine)

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


@app.get("/health")
def health():
    return {"status": "ok"}
