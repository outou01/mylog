from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai_client import chat, parse_json
from app.database import get_db
from app.models import ActiveProject, ActiveProjectEvent, DailyLog, DashboardSetting

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

SELF_TARGET_MINUTES = 420
PURPOSE_KEY = "purpose_text"
DEFAULT_PURPOSE_TEXT = "Pythonを武器にWeb業界へ転職する。\nAIノベルゲームを完成させる。\n仕事以外の人生を作る。"
ARIA_FALLBACK = "今日は30分だけ、自分の畑を耕しましょう。"
ARIA_TIMEOUT_SECONDS = 2.0


class FieldSummary(BaseModel):
    weekly_minutes: int
    progress_percent: int
    message: str


class PurposeSummary(BaseModel):
    text: str


class AriaSummary(BaseModel):
    name: str
    face: str
    mood: str
    message: str


class CurrentProjectSummary(BaseModel):
    id: int
    title: str
    reason: str
    last_touched_label: str
    next_action: str
    estimated_minutes: int
    status: str
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
    projects: list[CurrentProjectSummary]
    life_gauge: LifeGaugeSummary
    timeline: list[TimelineItem]
    aria: AriaSummary
    aria_message: str


class PurposeUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ProjectPayload(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    reason: str = Field(min_length=1, max_length=2000)
    next_action: str = Field(min_length=1, max_length=2000)
    estimated_minutes: int = Field(ge=1, le=1440, default=30)
    memo: str | None = Field(default=None, max_length=4000)
    status: str = Field(default="active", max_length=20)


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


def _format_minutes(minutes: int) -> str:
    hours = minutes // 60
    rest = minutes % 60
    if hours == 0:
        return f"{rest}分"
    if rest == 0:
        return f"{hours}時間"
    return f"{hours}時間{rest}分"


def _get_purpose(db: Session) -> str:
    setting = db.query(DashboardSetting).filter(DashboardSetting.key == PURPOSE_KEY).first()
    if setting:
        return setting.value
    setting = DashboardSetting(key=PURPOSE_KEY, value=DEFAULT_PURPOSE_TEXT)
    db.add(setting)
    db.commit()
    return setting.value


def _project_summary(project: ActiveProject, today: date) -> CurrentProjectSummary:
    return CurrentProjectSummary(
        id=project.id,
        title=project.title,
        reason=project.reason,
        last_touched_label=_last_touched_label(project.last_touched_at, today),
        next_action=project.next_action,
        estimated_minutes=project.estimated_minutes,
        status=project.status,
        memo=project.memo,
    )


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


def _fallback_aria(latest_log: DailyLog | None, weekly_minutes: int, project: ActiveProject) -> AriaSummary:
    if latest_log and latest_log.sleep_hours < 5.5:
        return AriaSummary(
            name="アリア",
            face="(・_・;)",
            mood="worried",
            message=f"睡眠が少なめです。今日は{project.estimated_minutes}分を全部やろうとせず、最初の10分だけ畑に戻りましょう。",
        )
    if latest_log and latest_log.overtime_hours >= 3:
        return AriaSummary(
            name="アリア",
            face="(｀・ω・´)",
            mood="steady",
            message="仕事でかなり削られています。だからこそ、次の一手だけを小さく確保しましょう。",
        )
    if weekly_minutes >= 180:
        return AriaSummary(
            name="アリア",
            face="(＾ω＾)",
            mood="proud",
            message="今週はちゃんと自分の畑に戻れています。この流れを、次の一手につなげましょう。",
        )
    return AriaSummary(
        name="アリア",
        face="(＾ω＾)",
        mood="normal",
        message=ARIA_FALLBACK,
    )


def _build_aria(
    purpose: str,
    project: ActiveProject,
    latest_log: DailyLog | None,
    weekly_minutes: int,
    progress_percent: int,
) -> AriaSummary:
    fallback = _fallback_aria(latest_log, weekly_minutes, project)
    latest_text = "まだログなし"
    if latest_log:
        latest_text = (
            f"日付:{latest_log.date} 睡眠:{latest_log.sleep_hours}h "
            f"残業:{latest_log.overtime_hours}h 気分:{latest_log.mood_score}/5 "
            f"メモ:{latest_log.memo or 'なし'}"
        )

    prompt = f"""
あなたはライフダッシュボード常駐キャラの「アリア」です。
ユーザーの体調、ログ、総合目標、現在タスクを見て、状況に合わせて寄り添う短いコメントを返してください。

性格:
- かわいい顔文字で存在感がある
- 監視者ではなく人生ナビゲーター
- 甘やかしすぎず、でも責めない
- やる気演説ではなく、前回の文脈へ戻す

総合目標:
{purpose}

現在タスク:
タイトル: {project.title}
理由: {project.reason}
次にやること: {project.next_action}
推定: {project.estimated_minutes}分
メモ: {project.memo or 'なし'}

今週の自分時間: {weekly_minutes}分
進捗: {progress_percent}%
直近ログ: {latest_text}

JSONのみ:
{{"face":"(＾ω＾) のような顔文字","mood":"normal/worried/proud/steady","message":"120文字以内"}}
"""
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(chat, prompt, 0.7)
    try:
        raw = future.result(timeout=ARIA_TIMEOUT_SECONDS)
    except TimeoutError:
        future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)
        return fallback
    finally:
        if future.done():
            executor.shutdown(wait=False, cancel_futures=True)

    if raw is None:
        return fallback

    data = parse_json(raw)
    return AriaSummary(
        name="アリア",
        face=(data.get("face") or fallback.face)[:24],
        mood=data.get("mood") or fallback.mood,
        message=(data.get("message") or fallback.message)[:140],
    )


@router.get("/home", response_model=DashboardHomeOut)
def get_dashboard_home(db: Session = Depends(get_db)):
    today = date.today()
    start = _week_start(today)
    purpose = _get_purpose(db)
    project = _ensure_seed_project(db, today)

    logs = (
        db.query(DailyLog)
        .filter(DailyLog.date >= start, DailyLog.date <= today)
        .order_by(DailyLog.date.asc())
        .all()
    )
    latest_log = db.query(DailyLog).order_by(DailyLog.date.desc()).first()
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
    projects = db.query(ActiveProject).order_by(ActiveProject.updated_at.desc(), ActiveProject.id.desc()).limit(8).all()

    try:
        aria = _build_aria(purpose, project, latest_log, weekly_minutes, progress_percent)
    except Exception as exc:
        print(f"[Dashboard] Aria home message fallback: {exc}")
        aria = _fallback_aria(latest_log, weekly_minutes, project)

    return DashboardHomeOut(
        field=FieldSummary(
            weekly_minutes=weekly_minutes,
            progress_percent=progress_percent,
            message=f"今週は{_format_minutes(weekly_minutes)}、自分の畑を耕しました。",
        ),
        purpose=PurposeSummary(text=purpose),
        current_project=_project_summary(project, today),
        projects=[_project_summary(item, today) for item in projects],
        life_gauge=LifeGaugeSummary(work_percent=work_percent, self_percent=self_percent),
        timeline=[
            TimelineItem(date_label=_date_label(event.event_date, today), title=event.title, note=event.note)
            for event in events
        ],
        aria=aria,
        aria_message=aria.message,
    )


@router.patch("/purpose", response_model=PurposeSummary)
def update_purpose(payload: PurposeUpdate, db: Session = Depends(get_db)):
    setting = db.query(DashboardSetting).filter(DashboardSetting.key == PURPOSE_KEY).first()
    if setting:
        setting.value = payload.text
    else:
        setting = DashboardSetting(key=PURPOSE_KEY, value=payload.text)
        db.add(setting)
    db.commit()
    return PurposeSummary(text=setting.value)


@router.post("/projects", response_model=CurrentProjectSummary, status_code=201)
def create_project(payload: ProjectPayload, db: Session = Depends(get_db)):
    today = date.today()
    if payload.status == "active":
        db.query(ActiveProject).filter(ActiveProject.status == "active").update({"status": "paused"})
    project = ActiveProject(
        title=payload.title,
        reason=payload.reason,
        next_action=payload.next_action,
        estimated_minutes=payload.estimated_minutes,
        memo=payload.memo,
        status=payload.status,
        last_touched_at=datetime.now(),
    )
    db.add(project)
    db.flush()
    db.add(ActiveProjectEvent(project=project, event_date=today, title="プロジェクト登録", note=payload.next_action))
    db.commit()
    db.refresh(project)
    return _project_summary(project, today)


@router.patch("/projects/{project_id}", response_model=CurrentProjectSummary)
def update_project(project_id: int, payload: ProjectPayload, db: Session = Depends(get_db)):
    project = db.query(ActiveProject).filter(ActiveProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if payload.status == "active":
        db.query(ActiveProject).filter(ActiveProject.id != project_id, ActiveProject.status == "active").update({"status": "paused"})
    project.title = payload.title
    project.reason = payload.reason
    project.next_action = payload.next_action
    project.estimated_minutes = payload.estimated_minutes
    project.memo = payload.memo
    project.status = payload.status
    project.last_touched_at = datetime.now()
    db.add(ActiveProjectEvent(project=project, event_date=date.today(), title="次の一手を更新", note=payload.next_action))
    db.commit()
    db.refresh(project)
    return _project_summary(project, date.today())


@router.post("/projects/{project_id}/activate", response_model=CurrentProjectSummary)
def activate_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(ActiveProject).filter(ActiveProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.query(ActiveProject).filter(ActiveProject.id != project_id, ActiveProject.status == "active").update({"status": "paused"})
    project.status = "active"
    project.last_touched_at = datetime.now()
    db.add(ActiveProjectEvent(project=project, event_date=date.today(), title="続きから再開", note=project.next_action))
    db.commit()
    db.refresh(project)
    return _project_summary(project, date.today())
