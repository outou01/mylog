from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DailyLog
from app.schemas import DailyLogCreate, DailyLogOut, DailyLogUpdate

router = APIRouter(prefix="/daily-logs", tags=["daily-logs"])


@router.post("", response_model=DailyLogOut, status_code=201)
def create_daily_log(payload: DailyLogCreate, db: Session = Depends(get_db)):
    existing = db.query(DailyLog).filter(DailyLog.date == payload.date).first()
    if existing:
        raise HTTPException(status_code=409, detail="Log for this date already exists")
    log = DailyLog(**payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("", response_model=list[DailyLogOut])
def list_daily_logs(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return db.query(DailyLog).order_by(DailyLog.date.desc()).offset(skip).limit(limit).all()


@router.get("/latest", response_model=DailyLogOut)
def get_latest_log(db: Session = Depends(get_db)):
    log = db.query(DailyLog).order_by(DailyLog.date.desc()).first()
    if not log:
        raise HTTPException(status_code=404, detail="No logs found")
    return log


@router.get("/{log_id}", response_model=DailyLogOut)
def get_daily_log(log_id: int, db: Session = Depends(get_db)):
    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return log


@router.patch("/{log_id}", response_model=DailyLogOut)
def update_daily_log(log_id: int, payload: DailyLogUpdate, db: Session = Depends(get_db)):
    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(log, field, value)
    db.commit()
    db.refresh(log)
    return log
