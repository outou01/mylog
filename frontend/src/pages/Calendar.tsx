import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createScheduleBlock,
  deleteScheduleBlock,
  fetchMonthCalendar,
  fetchPatterns,
  fetchWeekCompare,
  fetchWeeklyHours,
  fetchWeekSchedule,
  PatternInsight,
  ScheduleBlock,
  ScheduleBlockPayload,
  WeekCompare,
  WeekHoursCompare,
  WeekSchedule,
  updateScheduleBlock,
} from "../api/calendar";
import "./Calendar.css";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
const MOOD_COLOR: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#6b7280",
  4: "#60a5fa",
  5: "#4ade80",
};

type Tab = "schedule" | "month" | "hours" | "patterns";

const SCHEDULE_CATEGORIES = [
  { key: "creation", label: "創作", shortLabel: "創作" },
  { key: "job_search", label: "転職活動", shortLabel: "転職" },
  { key: "learning", label: "学習", shortLabel: "学習" },
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

export default function Calendar() {
  const navigate = useNavigate();
  const today = localDate();
  const [tab, setTab] = useState<Tab>("schedule");
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [form, setForm] = useState<ScheduleBlockPayload>({ ...emptyForm, date: today });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [monthCells, setMonthCells] = useState<any[]>([]);
  const [compare, setCompare] = useState<WeekCompare | null>(null);
  const [hours, setHours] = useState<WeekHoursCompare | null>(null);
  const [patterns, setPatterns] = useState<PatternInsight | null>(null);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const loadSchedule = async () => {
    const data = await fetchWeekSchedule(weekStart);
    setSchedule(data);
  };

  useEffect(() => {
    loadSchedule();
  }, [weekStart]);

  useEffect(() => {
    if (tab === "month") {
      const d = new Date(`${today}T00:00:00`);
      fetchMonthCalendar(d.getFullYear(), d.getMonth() + 1).then(setMonthCells);
      fetchWeekCompare().then(setCompare);
    }
    if (tab === "hours" && !hours) fetchWeeklyHours().then(setHours);
    if (tab === "patterns" && !patterns) fetchPatterns().then(setPatterns);
  }, [tab]);

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
      await loadSchedule();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (block: ScheduleBlock) => {
    if (!block.editable || block.id == null) return;
    setEditingId(block.id);
    setForm(toPayload(block));
  };

  const remove = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await deleteScheduleBlock(editingId);
      setEditingId(null);
      setForm({ ...emptyForm, date: today });
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
      <div className="cal-tabs">
        <button className={`cal-tab ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>週予定</button>
        <button className={`cal-tab ${tab === "month" ? "active" : ""}`} onClick={() => setTab("month")}>月ログ</button>
        <button className={`cal-tab ${tab === "hours" ? "active" : ""}`} onClick={() => setTab("hours")}>時間</button>
        <button className={`cal-tab ${tab === "patterns" ? "active" : ""}`} onClick={() => setTab("patterns")}>分析</button>
      </div>

      {tab === "schedule" && schedule && (
        <>
          <section className="card schedule-console">
            <div className="schedule-head">
              <button className="cal-nav-btn" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
              <div>
                <p className="schedule-kicker">月曜始まり</p>
                <h2>{displayDate(schedule.week_start)} - {displayDate(schedule.week_end)}</h2>
              </div>
              <button className="cal-nav-btn" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
            </div>

            <div className="schedule-actions">
              {SCHEDULE_CATEGORIES.map((category) => (
                <div className={`quick-category ${category.key}`} key={category.key}>
                  <span>{category.label}</span>
                  <button className="schedule-btn quick" onClick={() => quickDuration(category, 30)} disabled={saving}>30分</button>
                  <button className="schedule-btn quick" onClick={() => quickDuration(category, 60)} disabled={saving}>1時間</button>
                </div>
              ))}
            </div>

            <p className="schedule-note">{schedule.schedule_message || "仕事以外の時間は、余りものではなく人生の本体です。 ※自動生成"}</p>
          </section>

          <section className="schedule-layout">
            <div className="card week-board">
              <div className="week-grid">
                <div className="time-col">
                  {Array.from({ length: schedule.day_end_hour - schedule.day_start_hour + 1 }, (_, i) => (
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

            <form className="card schedule-form" onSubmit={submit}>
              <p className="schedule-kicker">{editingId ? "予定を編集" : "予定を追加"}</p>
              <label>
                日付
                <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
              </label>
              <div className="form-pair">
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
                タイトル
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </label>
              <label>
                種類
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  {SCHEDULE_CATEGORIES.map((category) => (
                    <option value={category.key} key={category.key}>{category.label}</option>
                  ))}
                </select>
              </label>
              <label>
                メモ
                <textarea rows={3} value={form.note ?? ""} onChange={(event) => setForm({ ...form, note: event.target.value })} />
              </label>
              <div className="form-actions">
                <button className="schedule-btn primary" disabled={saving}>{editingId ? "保存" : "追加"}</button>
                {editingId && <button type="button" className="schedule-btn danger" onClick={remove} disabled={saving}>削除</button>}
                {editingId && <button type="button" className="schedule-btn" onClick={() => setEditingId(null)}>解除</button>}
              </div>
            </form>
          </section>
        </>
      )}

      {tab === "month" && (
        <>
          <section className="card cal-card">
            <h2 className="plain-title">月ログ</h2>
            <div className="cal-grid-header">
              {WEEKDAYS.map((d, i) => <div key={d} className={`cal-wday ${i >= 5 ? "weekend" : ""}`}>{d}</div>)}
            </div>
            <div className="cal-grid">
              {monthCells.map((cell) => {
                const d = new Date(`${cell.date}T00:00:00`);
                const moodColor = cell.mood_score ? MOOD_COLOR[cell.mood_score] : undefined;
                return (
                  <button
                    key={cell.date}
                    className={`cal-cell ${cell.has_log ? "has-log" : ""} ${cell.date === today ? "today" : ""}`}
                    style={moodColor && cell.has_log ? { borderColor: moodColor } : undefined}
                    onClick={() => cell.has_log ? navigate("/logs") : navigate("/log")}
                  >
                    <span className="cal-day-num">{d.getDate()}</span>
                    {cell.has_log && <span className="cal-sleep">{cell.sleep_hours}h</span>}
                  </button>
                );
              })}
            </div>
          </section>
          {compare && (
            <section className="card compare-card">
              <h2 className="plain-title">今週 vs 先週</h2>
              <div className="aria-compare-bubble">{compare.aria_comment}</div>
            </section>
          )}
        </>
      )}

      {tab === "hours" && (
        <section className="card hours-card">
          <h2 className="plain-title">自分の時間</h2>
          {hours ? (
            <div className="hours-total-row">
              <div>
                <div className="hours-total-val">{hours.this_week.total_advance_hours}h</div>
                <div className="hours-total-label">今週</div>
              </div>
              <div>
                <div className="hours-total-val muted">{hours.last_week.total_advance_hours}h</div>
                <div className="hours-total-label">先週</div>
              </div>
            </div>
          ) : <p className="no-data">読み込み中...</p>}
        </section>
      )}

      {tab === "patterns" && (
        <section className="card patterns-card">
          <h2 className="plain-title">パターン分析</h2>
          {patterns ? (
            <>
              <div className="aria-compare-bubble">{patterns.aria_comment}</div>
              <div className="patterns-list">
                {patterns.insights.map((insight, i) => (
                  <div key={i} className="pattern-item">
                    <span className="pattern-num">{i + 1}</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="no-data">読み込み中...</p>}
        </section>
      )}
    </div>
  );
}
