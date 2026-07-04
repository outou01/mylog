from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ai_client import chat, parse_json
from app.database import get_db
from app.models import ActiveProject, ActiveProjectEvent, DailyLog

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

SELF_TARGET_MINUTES = 420
PURPOSE_TEXT = "Pythonを武器にWeb業界へ転職する。\nAIノベルゲームを完成させる。\n仕事以外の人生を作る。"
ARIA_FALLBACK = "今日は30分だけ、自分の畑を耕しましょう。"
ARIA_TIMEOUT_SECONDS = 2.0


class FieldSummary(BaseModel):
    weekly_minutes: int
    progress_percent: int
    message: str


class PurposeSummary(BaseModel):
    text: str


class CurrentProjectSummary(BaseModel):
    id: int
    title: str
    reason: str
    last_touched_label: str
    next_action: str
    estimated_minutes: int
    memo: str | None


class LifeGaugeSummary(BaseModel):
    work_percent: int
    self_percent: int


class TimelineItem(BaseModel):
    date_label: str
    title: str
    note: str | None = None


class DashboardHomeOut(BaseModel):
    field: FieldSummary
    purpose: PurposeSummary
    current_project: CurrentProjectSummary
    life_gauge: LifeGaugeSummary
    timeline: list[TimelineItem]
    aria_message: str


def _week_start(today: date) -> date:
    return today - timedelta(days=today.weekday())


def _self_hours(log: DailyLog) -> float:
    return (
        (log.create_hours or 0)
        + (log.workout_hours or 0)
        + (log.study_hours or 0)
        + (log.code_hours or 0)
        + (log.job_search_hours or 0)
    )


def _clamp_percent(value: float) -> int:
    return max(0, min(100, round(value)))


def _last_touched_label(last_touched_at: datetime, today: date) -> str:
    days = (today - last_touched_at.date()).days
    if days <= 0:
        return "今日"
    if days == 1:
        return "昨日"
    return f"{days}日前"


def _date_label(event_date: date, today: date) -> str:
    if event_date == today:
        return "今日"
    return f"{event_date.month}/{event_date.day}"


def _ensure_seed_project(db: Session, today: date) -> ActiveProject:
    project = (
        db.query(ActiveProject)
        .filter(ActiveProject.status == "active")
        .order_by(ActiveProject.last_touched_at.desc())
        .first()
    )
    if project:
        return project

    project = ActiveProject(
        title="人生改善ダッシュボード",
        reason="自分の人生を管理し、仕事以外の人生を前に進めるため",
        last_touched_at=datetime.combine(today - timedelta(days=6), datetime.min.time()),
        next_action="ホーム画面を、目的が一瞬で分かるUIへ変更する",
        estimated_minutes=30,
        status="active",
        memo="Gemini接続は完了。次はホーム画面改善。",
    )
    db.add(project)
    db.flush()

    seed_events = [
        (today - timedelta(days=12), "Gemini接続", "AIコメント生成の土台を接続。"),
        (today - timedelta(days=11), "Docker起動確認", "バックエンドとフロントの起動を確認。"),
        (today - timedelta(days=6), "ダッシュボード改善案", "復帰画面として作り替える方針を整理。"),
        (today, "ホーム画面改善", "前回の文脈に5秒で戻れるUIを実装。"),
    ]
    for event_date, title, note in seed_events:
        db.add(ActiveProjectEvent(project=project, event_date=event_date, title=title, note=note))

    db.commit()
    db.refresh(project)
    return project


def _build_aria_message(project: ActiveProject, weekly_minutes: int, progress_percent: int) -> str:
    prompt = f"""
あなたは人生ナビゲーターの「アリア」です。
温かいが甘やかしすぎず、ユーザーが前回の文脈に戻れる一言を日本語で返してください。

目的:
{PURPOSE_TEXT}

今のプロジェクト: {project.title}
理由: {project.reason}
次にやること: {project.next_action}
今週の自分時間: {weekly_minutes}分
進捗: {progress_percent}%

JSONのみで返してください:
{{"message":"80文字以内の一言"}}
"""
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(chat, prompt, 0.7)
    try:
        raw = future.result(timeout=ARIA_TIMEOUT_SECONDS)
    except TimeoutError:
        future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)
        return "仕事では他人の畑を耕しています。今日は30分だけ、あなた自身の畑を耕きませんか？"
    finally:
        if future.done():
            executor.shutdown(wait=False, cancel_futures=True)
    if raw is None:
        return "仕事では他人の畑を耕しています。今日は30分だけ、あなた自身の畑を耕きませんか？"
    data = parse_json(raw)
    message = data.get("message") or ARIA_FALLBACK
    return message[:90]


@router.get("/home", response_model=DashboardHomeOut)
def get_dashboard_home(db: Session = Depends(get_db)):
    today = date.today()
    start = _week_start(today)
    project = _ensure_seed_project(db, today)

    logs = (
        db.query(DailyLog)
        .filter(DailyLog.date >= start, DailyLog.date <= today)
        .order_by(DailyLog.date.asc())
        .all()
    )
    weekly_minutes = round(sum(_self_hours(log) for log in logs) * 60)
    work_minutes = round(sum((log.overtime_hours or 0) for log in logs) * 60)

    progress_percent = _clamp_percent((weekly_minutes / SELF_TARGET_MINUTES) * 100) if SELF_TARGET_MINUTES else 0
    self_percent = progress_percent if weekly_minutes else 30
    work_percent = _clamp_percent((work_minutes / 600) * 100) if work_minutes else 90

    events = (
        db.query(ActiveProjectEvent)
        .filter(ActiveProjectEvent.project_id == project.id)
        .order_by(ActiveProjectEvent.event_date.asc(), ActiveProjectEvent.id.asc())
        .limit(8)
        .all()
    )

    try:
        aria_message = _build_aria_message(project, weekly_minutes, progress_percent)
    except Exception as exc:
        print(f"[Dashboard] Aria home message fallback: {exc}")
        aria_message = ARIA_FALLBACK

    hours = weekly_minutes // 60
    minutes = weekly_minutes % 60
    time_text = f"{hours}時間{minutes}分" if minutes else f"{hours}時間"

    return DashboardHomeOut(
        field=FieldSummary(
            weekly_minutes=weekly_minutes,
            progress_percent=progress_percent,
            message=f"今週は{time_text}、自分の畑を耕しました。",
        ),
        purpose=PurposeSummary(text=PURPOSE_TEXT),
        current_project=CurrentProjectSummary(
            id=project.id,
            title=project.title,
            reason=project.reason,
            last_touched_label=_last_touched_label(project.last_touched_at, today),
            next_action=project.next_action,
            estimated_minutes=project.estimated_minutes,
            memo=project.memo,
        ),
        life_gauge=LifeGaugeSummary(work_percent=work_percent, self_percent=self_percent),
        timeline=[
            TimelineItem(date_label=_date_label(event.event_date, today), title=event.title, note=event.note)
            for event in events
        ],
        aria_message=aria_message,
    )
