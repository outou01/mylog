import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createScheduleBlock,
  deleteScheduleBlock,
  fetchWeekSchedule,
  ScheduleBlock,
  ScheduleBlockPayload,
  WeekSchedule,
  updateScheduleBlock,
} from "../api/calendar";
import TimeAnalysis from "./TimeAnalysis";
import "./Calendar.css";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

type Tab = "schedule" | "hours";

const SCHEDULE_CATEGORIES = [
  { key: "creation", label: "創作", shortLabel: "創作" },
  { key: "workout", label: "筋トレ", shortLabel: "筋トレ" },
  { key: "job_search", label: "転職活動", shortLabel: "転職" },
  { key: "social", label: "交流", shortLabel: "交流" },
  { key: "reading", label: "読書", shortLabel: "読書" },
  { key: "meditation", label: "瞑想", shortLabel: "瞑想" },
];

const emptyForm: ScheduleBlockPayload = {
  date: "",
  start_time: "20:30",
  end_time: "21:00",
  title: "創作",
  category: "creation",
  note: "",
};

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateText: string, days: number) {
  const d = new Date(`${dateText}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

function mondayOf(dateText: string) {
  const d = new Date(`${dateText}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localDate(d);
}

function minutesOf(timeText: string) {
  const [h, m] = timeText.split(":").map(Number);
  return h * 60 + m;
}

function timeTextFromMinutes(totalMinutes: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function currentHalfHourSlot(durationMinutes: number) {
  const now = new Date();
  let start = now.getHours() * 60 + Math.floor(now.getMinutes() / 30) * 30;
  let end = start + durationMinutes;
  if (end > 24 * 60) {
    end = 24 * 60 - 1;
    start = Math.max(0, end - durationMinutes);
  }
  return {
    start_time: timeTextFromMinutes(start),
    end_time: timeTextFromMinutes(end),
  };
}

function displayDate(dateText: string) {
  const d = new Date(`${dateText}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function blockStyle(block: ScheduleBlock, schedule: WeekSchedule) {
  const dayStart = schedule.day_start_hour * 60;
  const total = (schedule.day_end_hour - schedule.day_start_hour) * 60;
  const top = ((minutesOf(block.start_time) - dayStart) / total) * 100;
  const height = ((minutesOf(block.end_time) - minutesOf(block.start_time)) / total) * 100;
  return {
    top: `${Math.max(0, top)}%`,
    height: `${Math.max(4, height)}%`,
  };
}

function toPayload(block: ScheduleBlock): ScheduleBlockPayload {
  return {
    date: block.date,
    start_time: block.start_time,
    end_time: block.end_time,
    title: block.title,
    category: block.category,
    note: block.note ?? "",
  };
}

export default function Calendar({ embedded = false }: { embedded?: boolean }) {
  const today = localDate();
  const [tab, setTab] = useState<Tab>("schedule");
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [form, setForm] = useState<ScheduleBlockPayload>({ ...emptyForm, date: today });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const loadSchedule = async () => {
    const data = await fetchWeekSchedule(weekStart);
    setSchedule(data);
  };

  useEffect(() => {
    loadSchedule();
  }, [weekStart]);

  useEffect(() => {
    document.body.dataset.ariaContext = tab === "schedule" ? "calendar-week" : "calendar-growth";
    document.body.dataset.ariaWeekStart = weekStart;
    return () => {
      delete document.body.dataset.ariaContext;
      delete document.body.dataset.ariaWeekStart;
    };
  }, [tab, weekStart]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, note: form.note || null };
      if (editingId) {
        await updateScheduleBlock(editingId, payload);
      } else {
        await createScheduleBlock(payload);
      }
      setEditingId(null);
      setForm({ ...emptyForm, date: payload.date });
      setFormOpen(false);
      await loadSchedule();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (block: ScheduleBlock) => {
    if (!block.editable || block.id == null) return;
    setEditingId(block.id);
    setForm(toPayload(block));
    setFormOpen(true);
  };

  const openNew = (date = today, startTime?: string) => {
    const start = startTime ? minutesOf(startTime) : minutesOf(emptyForm.start_time);
    setEditingId(null);
    setForm({
      ...emptyForm,
      date,
      start_time: timeTextFromMinutes(start),
      end_time: timeTextFromMinutes(start + 30),
    });
    setFormOpen(true);
  };

  const openNewAtPosition = (date: string, clientY: number, lane: HTMLDivElement) => {
    if (!schedule) return;
    const rect = lane.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const dayStart = schedule.day_start_hour * 60;
    const total = (schedule.day_end_hour - schedule.day_start_hour) * 60;
    const start = dayStart + Math.floor((ratio * total) / 30) * 30;
    openNew(date, timeTextFromMinutes(Math.min(start, schedule.day_end_hour * 60 - 30)));
  };

  const closeForm = () => {
    setEditingId(null);
    setFormOpen(false);
  };

  const remove = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await deleteScheduleBlock(editingId);
      setEditingId(null);
      setForm({ ...emptyForm, date: today });
      setFormOpen(false);
      await loadSchedule();
    } finally {
      setSaving(false);
    }
  };

  const quickDuration = async (category: (typeof SCHEDULE_CATEGORIES)[number], durationMinutes: number) => {
    const slot = currentHalfHourSlot(durationMinutes);
    setSaving(true);
    try {
      await createScheduleBlock({
        date: today,
        start_time: slot.start_time,
        end_time: slot.end_time,
        title: `${category.shortLabel} ${durationMinutes === 30 ? "30分" : "1時間"}`,
        category: category.key,
        note: null,
      });
      await loadSchedule();
    } finally {
      setSaving(false);
    }
  };

  const moveDraggedBlock = async (dateText: string, clientY: number, lane: HTMLDivElement) => {
    if (!schedule || draggingId == null) return;
    const block = schedule.blocks.find((item) => item.id === draggingId);
    if (!block || block.id == null || !block.editable) return;

    const rect = lane.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const dayStart = schedule.day_start_hour * 60;
    const dayEnd = schedule.day_end_hour * 60;
    const total = dayEnd - dayStart;
    const duration = Math.max(30, minutesOf(block.end_time) - minutesOf(block.start_time));
    let start = dayStart + Math.floor((ratio * total) / 30) * 30;
    if (start + duration > dayEnd) start = dayEnd - duration;
    start = Math.max(dayStart, start);

    setSaving(true);
    try {
      await updateScheduleBlock(block.id, {
        ...toPayload(block),
        date: dateText,
        start_time: timeTextFromMinutes(start),
        end_time: timeTextFromMinutes(start + duration),
      });
      await loadSchedule();
    } finally {
      setDraggingId(null);
      setSaving(false);
    }
  };

  return (
    <div className="calendar-page">
      {!embedded && <div className="cal-tabs">
        <button className={`cal-tab ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>🌱 今週の畑</button>
        <button className={`cal-tab ${tab === "hours" ? "active" : ""}`} onClick={() => setTab("hours")}>🌾 畑の成長</button>
      </div>}

      {tab === "schedule" && schedule && (
        <>
          <section className="schedule-console">
            <div className="schedule-topbar">
              <div className="schedule-head">
                <button className="cal-nav-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} title="前の週">‹</button>
                <div>
                  <span>MY WEEK</span>
                  <h2>{displayDate(schedule.week_start)} - {displayDate(schedule.week_end)}</h2>
                </div>
                <button className="cal-nav-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} title="次の週">›</button>
              </div>
              <button className="schedule-add-btn" type="button" onClick={() => openNew()}>＋ 予定を追加</button>
            </div>

            <div className="category-quick-strip" aria-label="すぐ植える">
              {SCHEDULE_CATEGORIES.map((category) => (
                <div className={`quick-category ${category.key}`} key={category.key}>
                  <span>{category.label}</span>
                  <button onClick={() => quickDuration(category, 30)} disabled={saving}>+30</button>
                  <button onClick={() => quickDuration(category, 60)} disabled={saving}>+60</button>
                </div>
              ))}
            </div>

          </section>

          <section className="schedule-layout">
            <div className="card week-board">
              <div className="week-grid">
                <div className="time-col">
                  <span className="time-head-spacer" />
                  {Array.from({ length: schedule.day_end_hour - schedule.day_start_hour }, (_, i) => (
                    <span key={i}>{schedule.day_start_hour + i}:00</span>
                  ))}
                </div>
                {weekDays.map((day, index) => {
                  const dayBlocks = schedule.blocks.filter((block) => block.date === day);
                  return (
                    <div className="day-col" key={day}>
                      <div className={`day-head ${day === today ? "today" : ""}`}>
                        <span>{WEEKDAYS[index]}</span>
                        <strong>{displayDate(day)}</strong>
                      </div>
                      <div
                        className={`day-lane ${draggingId ? "drop-ready" : ""}`}
                        onDragOver={(event) => {
                          if (draggingId != null) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          moveDraggedBlock(day, event.clientY, event.currentTarget);
                        }}
                        onClick={(event) => {
                          if (event.target === event.currentTarget) {
                            openNewAtPosition(day, event.clientY, event.currentTarget);
                          }
                        }}
                      >
                        {dayBlocks.map((block, blockIndex) => (
                          <button
                            key={`${block.id ?? "work"}-${block.date}-${block.start_time}-${blockIndex}`}
                            className={`schedule-block ${block.category} ${block.editable ? "editable" : ""} ${draggingId === block.id ? "dragging" : ""}`}
                            style={blockStyle(block, schedule)}
                            draggable={block.editable}
                            onDragStart={(event) => {
                              if (!block.editable || block.id == null) return;
                              setDraggingId(block.id);
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", String(block.id));
                            }}
                            onDragEnd={() => setDraggingId(null)}
                            onClick={() => startEdit(block)}
                          >
                            <span>{block.start_time}-{block.end_time}</span>
                            <strong>{block.title}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {formOpen && (
            <div className="schedule-editor-backdrop" onClick={closeForm}>
              <form className="schedule-editor" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
                <header>
                  <div>
                    <span>{editingId ? "予定を整える" : "新しい予定"}</span>
                    <h2>{editingId ? form.title : "自分の時間を植える"}</h2>
                  </div>
                  <button type="button" className="editor-close" onClick={closeForm} title="閉じる">×</button>
                </header>
                <label>
                  タイトル
                  <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} autoFocus />
                </label>
                <div className="editor-row">
                  <label>
                    日付
                    <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
                  </label>
                  <label>
                    種類
                    <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                      {SCHEDULE_CATEGORIES.map((category) => (
                        <option value={category.key} key={category.key}>{category.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="editor-row">
              <label>
                開始
                <input type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} />
              </label>
              <label>
                終了
                <input type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} />
              </label>
                </div>
                <label>
                  メモ <small>任意</small>
                  <textarea rows={2} value={form.note ?? ""} onChange={(event) => setForm({ ...form, note: event.target.value })} />
                </label>
                <div className="editor-actions">
                  {editingId && <button type="button" className="schedule-btn danger" onClick={remove} disabled={saving}>削除</button>}
                  <button className="schedule-btn primary" disabled={saving}>{editingId ? "変更を保存" : "予定を追加"}</button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {tab === "hours" && (
        <TimeAnalysis embedded />
      )}
    </div>
  );
}
