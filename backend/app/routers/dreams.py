from datetime import date as dt_date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Dream, DreamProject, ScheduleBlock, SeedTask

router = APIRouter(prefix="/dreams", tags=["dreams"])


CATEGORIES = {"creation", "social", "job_search", "workout"}


class DreamPayload(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    category: str = Field(max_length=40)
    description: str | None = None
    image_url: str | None = None
    icon: str | None = Field(default=None, max_length=20)
    progress: int = Field(default=0, ge=0, le=100)


class DreamOut(DreamPayload):
    id: int
    linked_project_id: int | None = None


class ProjectPayload(BaseModel):
    dream_id: int
    title: str = Field(min_length=1, max_length=160)
    category: str = Field(max_length=40)
    description: str | None = None
    current_position: str | None = None
    steps: list[str] = []


class ProjectOut(ProjectPayload):
    id: int


class SeedPayload(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    category: str = Field(max_length=40)
    parent_id: int | None = None
    dream_id: int | None = None
    project_id: int | None = None
    priority: str | None = Field(default=None, max_length=20)
    depth: int = Field(default=0, ge=0, le=12)
    sort_order: int = Field(default=0, ge=0)
    section: str | None = Field(default=None, max_length=80)
    description: str | None = None
    purpose: str | None = None
    importance: str | None = None
    concern: str | None = None
    motivation: str | None = None
    estimated_minutes: int = Field(default=30, ge=5, le=480)
    actual_minutes: int | None = Field(default=None, ge=0, le=1440)
    status: str = Field(default="active", max_length=20)
    notes: str | None = None


class SeedOut(SeedPayload):
    id: int
    completed_at: str | None = None


class CompleteSeedPayload(BaseModel):
    actual_minutes: int | None = Field(default=None, ge=0, le=1440)


class ProjectDetailOut(BaseModel):
    dream: DreamOut
    project: ProjectOut
    seeds: list[SeedOut]


class PlantPayload(BaseModel):
    date: dt_date | None = None
    start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")


class PlantedOut(BaseModel):
    schedule_block_id: int
    date: str
    start_time: str
    end_time: str


def _dream_out(dream: Dream) -> DreamOut:
    return DreamOut(
        id=dream.id,
        title=dream.title,
        category=dream.category,
        description=dream.description,
        image_url=dream.image_url,
        icon=dream.icon,
        progress=dream.progress,
        linked_project_id=dream.linked_project_id,
    )


def _project_out(project: DreamProject) -> ProjectOut:
    steps = [line for line in (project.steps or "").split("\n") if line.strip()]
    return ProjectOut(
        id=project.id,
        dream_id=project.dream_id,
        title=project.title,
        category=project.category,
        description=project.description,
        current_position=project.current_position,
        steps=steps,
    )


def _seed_out(seed: SeedTask) -> SeedOut:
    return SeedOut(
        id=seed.id,
        parent_id=seed.parent_id,
        dream_id=seed.dream_id,
        project_id=seed.project_id,
        title=seed.title,
        category=seed.category,
        priority=seed.priority,
        depth=seed.depth,
        sort_order=seed.sort_order,
        section=seed.section,
        description=seed.description,
        purpose=seed.purpose,
        importance=seed.importance,
        concern=seed.concern,
        motivation=seed.motivation,
        estimated_minutes=seed.estimated_minutes,
        actual_minutes=seed.actual_minutes,
        status=seed.status,
        notes=seed.notes,
        completed_at=seed.completed_at.isoformat() if seed.completed_at else None,
    )


def _normalize_category(category: str) -> str:
    return category.strip() if category and category.strip() else "creation"


def _seed_defaults(db: Session) -> None:
    if db.query(Dream).first():
        return

    defaults = [
        {
            "dream": Dream(
                title="Steamでゲームを公開する",
                category="creation",
                description="AIノベルゲームを完成させ、公開まで持っていく。",
                icon="🎮",
                progress=18,
            ),
            "project": {
                "title": "AIノベルゲーム制作",
                "current_position": "Gemini接続とダッシュボード改善が進行中。次は企画とシナリオを具体化する。",
                "steps": ["企画", "シナリオ", "イラスト", "UI", "Steamページ作成", "公開"],
                "seeds": [
                    ("シナリオ", "初稿を書く", "三人称一元視点で勢いだけ書く", 45),
                    ("検証", "BMを確認する", "公開後に届く作品として需要を確かめる", 30),
                ],
            },
        },
        {
            "dream": Dream(
                title="Web系に転職する",
                category="job_search",
                description="PythonとWeb制作を武器に、仕事以外の人生を守れる働き方へ移る。",
                icon="💻",
                progress=22,
            ),
            "project": {
                "title": "Web転職プロジェクト",
                "current_position": "ポートフォリオの核になるアプリを育てている。",
                "steps": ["技術学習", "ポートフォリオ", "職務経歴書", "応募", "面接"],
                "seeds": [
                    ("ポートフォリオ", "READMEを整える", "作った価値が伝わる入口にする", 30),
                    ("技術学習", "FastAPIの実装を読む", "面接で説明できる理解にする", 45),
                ],
            },
        },
        {
            "dream": Dream(
                title="交流を増やす",
                category="social",
                description="外見・体調・会話の機会を整えて、仕事以外のつながりを増やす。",
                icon="🌿",
                progress=10,
            ),
            "project": {
                "title": "交流と自信づくり",
                "current_position": "まずは外に出る頻度と体調の土台を作る。",
                "steps": ["身だしなみ", "筋トレ", "外出", "イベント参加", "継続"],
                "seeds": [
                    ("筋トレ", "30分だけ筋トレする", "交流に向かうための体力と自信を作る", 30),
                    ("外出", "イベント候補を1つ調べる", "人と会う未来の入口を作る", 30),
                ],
            },
        },
    ]

    for item in defaults:
        dream = item["dream"]
        db.add(dream)
        db.flush()
        project_data = item["project"]
        project = DreamProject(
            dream_id=dream.id,
            title=project_data["title"],
            category=dream.category,
            description=dream.description,
            current_position=project_data["current_position"],
            steps="\n".join(project_data["steps"]),
        )
        db.add(project)
        db.flush()
        dream.linked_project_id = project.id
        for section, title, purpose, minutes in project_data["seeds"]:
            db.add(SeedTask(
                dream_id=dream.id,
                project_id=project.id,
                title=title,
                category=dream.category,
                section=section,
                purpose=purpose,
                sort_order=minutes,
                estimated_minutes=minutes,
                status="active",
            ))
    db.commit()


def _parse_hhmm(value: str) -> time:
    return datetime.strptime(value, "%H:%M").time()


def _time_text(value: time) -> str:
    return value.strftime("%H:%M")


def _default_start() -> time:
    now = datetime.now()
    rounded = now.replace(minute=0, second=0, microsecond=0)
    return rounded.time()


def _end_time(start: time, minutes: int) -> time:
    anchor = datetime.combine(dt_date.today(), start) + timedelta(minutes=minutes)
    return anchor.time()


@router.get("", response_model=list[DreamOut])
def list_dreams(db: Session = Depends(get_db)):
    _seed_defaults(db)
    dreams = db.query(Dream).order_by(Dream.created_at.asc(), Dream.id.asc()).all()
    return [_dream_out(dream) for dream in dreams]


@router.post("", response_model=DreamOut, status_code=201)
def create_dream(payload: DreamPayload, db: Session = Depends(get_db)):
    dream = Dream(
        title=payload.title,
        category=_normalize_category(payload.category),
        description=payload.description,
        image_url=payload.image_url,
        icon=payload.icon,
        progress=payload.progress,
    )
    db.add(dream)
    db.flush()
    project = DreamProject(
        dream_id=dream.id,
        title=payload.title,
        category=dream.category,
        description=payload.description,
        current_position="最初の一歩を決めるところ。",
        steps="現在地\n次の一手\n公開・達成",
    )
    db.add(project)
    db.flush()
    dream.linked_project_id = project.id
    db.commit()
    db.refresh(dream)
    return _dream_out(dream)


@router.patch("/{dream_id}", response_model=DreamOut)
def update_dream(dream_id: int, payload: DreamPayload, db: Session = Depends(get_db)):
    dream = db.query(Dream).filter(Dream.id == dream_id).first()
    if not dream:
        raise HTTPException(status_code=404, detail="Dream not found")
    dream.title = payload.title
    dream.category = _normalize_category(payload.category)
    dream.description = payload.description
    dream.image_url = payload.image_url
    dream.icon = payload.icon
    dream.progress = payload.progress
    db.commit()
    db.refresh(dream)
    return _dream_out(dream)


@router.delete("/{dream_id}", status_code=204)
def delete_dream(dream_id: int, db: Session = Depends(get_db)):
    dream = db.query(Dream).filter(Dream.id == dream_id).first()
    if not dream:
        raise HTTPException(status_code=404, detail="Dream not found")
    db.delete(dream)
    db.commit()
    return None


@router.get("/{dream_id}/project", response_model=ProjectDetailOut)
def get_project_detail(dream_id: int, db: Session = Depends(get_db)):
    _seed_defaults(db)
    dream = db.query(Dream).filter(Dream.id == dream_id).first()
    if not dream:
        raise HTTPException(status_code=404, detail="Dream not found")
    project = (
        db.query(DreamProject)
        .filter(DreamProject.id == dream.linked_project_id)
        .first()
        or db.query(DreamProject).filter(DreamProject.dream_id == dream.id).first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    seeds = (
        db.query(SeedTask)
        .filter(SeedTask.project_id == project.id)
        .order_by(SeedTask.sort_order.asc(), SeedTask.section.asc(), SeedTask.id.asc())
        .all()
    )
    return ProjectDetailOut(dream=_dream_out(dream), project=_project_out(project), seeds=[_seed_out(seed) for seed in seeds])


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, payload: ProjectPayload, db: Session = Depends(get_db)):
    project = db.query(DreamProject).filter(DreamProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.title = payload.title
    project.category = _normalize_category(payload.category)
    project.description = payload.description
    project.current_position = payload.current_position
    project.steps = "\n".join(payload.steps)
    db.commit()
    db.refresh(project)
    return _project_out(project)


@router.get("/seeds/list", response_model=list[SeedOut])
def list_seeds(db: Session = Depends(get_db)):
    _seed_defaults(db)
    seeds = db.query(SeedTask).order_by(SeedTask.sort_order.asc(), SeedTask.category.asc(), SeedTask.section.asc(), SeedTask.id.asc()).all()
    return [_seed_out(seed) for seed in seeds]


@router.post("/seeds", response_model=SeedOut, status_code=201)
def create_seed(payload: SeedPayload, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["category"] = _normalize_category(payload.category)
    if data.get("parent_id"):
        parent = db.query(SeedTask).filter(SeedTask.id == data["parent_id"]).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent seed not found")
        data["depth"] = min((parent.depth or 0) + 1, 12)
        data["dream_id"] = data.get("dream_id") or parent.dream_id
        data["project_id"] = data.get("project_id") or parent.project_id
        data["category"] = data.get("category") or parent.category
    seed = SeedTask(**data)
    db.add(seed)
    db.commit()
    db.refresh(seed)
    return _seed_out(seed)


@router.patch("/seeds/{seed_id}", response_model=SeedOut)
def update_seed(seed_id: int, payload: SeedPayload, db: Session = Depends(get_db)):
    seed = db.query(SeedTask).filter(SeedTask.id == seed_id).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Seed not found")
    for key, value in payload.model_dump().items():
        setattr(seed, key, value)
    seed.category = _normalize_category(seed.category)
    db.commit()
    db.refresh(seed)
    return _seed_out(seed)


@router.delete("/seeds/{seed_id}", status_code=204)
def delete_seed(seed_id: int, db: Session = Depends(get_db)):
    seed = db.query(SeedTask).filter(SeedTask.id == seed_id).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Seed not found")
    db.delete(seed)
    db.commit()
    return None


@router.post("/seeds/{seed_id}/plant", response_model=PlantedOut, status_code=201)
def plant_seed(seed_id: int, payload: PlantPayload | None = None, db: Session = Depends(get_db)):
    seed = db.query(SeedTask).filter(SeedTask.id == seed_id).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Seed not found")
    payload = payload or PlantPayload()
    block_date = payload.date or dt_date.today()
    start = _parse_hhmm(payload.start_time) if payload.start_time else _default_start()
    end = _end_time(start, seed.estimated_minutes)
    block = ScheduleBlock(
        date=block_date,
        start_time=start,
        end_time=end,
        title=seed.title,
        category=seed.category,
        note=seed.notes or seed.purpose or seed.importance or seed.description,
        dream_id=seed.dream_id,
        project_id=seed.project_id,
        seed_task_id=seed.id,
    )
    seed.status = "planted"
    db.add(block)
    db.commit()
    db.refresh(block)
    return PlantedOut(
        schedule_block_id=block.id,
        date=block.date.isoformat(),
        start_time=_time_text(block.start_time),
        end_time=_time_text(block.end_time),
    )


@router.post("/seeds/{seed_id}/complete", response_model=SeedOut)
def complete_seed(seed_id: int, payload: CompleteSeedPayload | None = None, db: Session = Depends(get_db)):
    seed = db.query(SeedTask).filter(SeedTask.id == seed_id).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Seed not found")

    payload = payload or CompleteSeedPayload()
    actual_minutes = payload.actual_minutes or seed.actual_minutes or seed.estimated_minutes
    seed.status = "done"
    seed.actual_minutes = actual_minutes
    seed.completed_at = datetime.now()

    existing_block = (
        db.query(ScheduleBlock)
        .filter(ScheduleBlock.seed_task_id == seed.id)
        .order_by(ScheduleBlock.date.desc(), ScheduleBlock.start_time.desc())
        .first()
    )
    if existing_block:
        existing_block.completed = True
    else:
        start = _default_start()
        db.add(ScheduleBlock(
            date=dt_date.today(),
            start_time=start,
            end_time=_end_time(start, actual_minutes),
            title=seed.title,
            category=seed.category,
            note=seed.notes or seed.purpose or seed.importance or seed.description,
            dream_id=seed.dream_id,
            project_id=seed.project_id,
            seed_task_id=seed.id,
            completed=True,
        ))

    db.commit()
    db.refresh(seed)
    return _seed_out(seed)
