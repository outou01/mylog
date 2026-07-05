import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DayCell, fetchMonthCalendar, fetchWeekCompare, WeekCompare } from "../api/calendar";
import "./Calendar.css";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
const MOOD_COLOR: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#6b7280",
  4: "#60a5fa",
  5: "#4ade80",
};

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MonthLog() {
  const navigate = useNavigate();
  const today = useMemo(() => localDate(), []);
  const [monthCells, setMonthCells] = useState<DayCell[]>([]);
  const [compare, setCompare] = useState<WeekCompare | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  useEffect(() => {
    const d = new Date(`${today}T00:00:00`);
    fetchMonthCalendar(d.getFullYear(), d.getMonth() + 1).then(setMonthCells);
  }, [today]);

  const requestCompare = async () => {
    setLoadingCompare(true);
    try {
      const data = await fetchWeekCompare();
      setCompare(data);
    } finally {
      setLoadingCompare(false);
    }
  };

  return (
    <div className="calendar-page">
      <section className="card cal-card">
        <div className="schedule-head">
          <div>
            <p className="schedule-kicker">私生活ログ</p>
            <h2 className="plain-title">月ログ</h2>
          </div>
          <button className="schedule-btn quick" type="button" onClick={requestCompare} disabled={loadingCompare}>
            {loadingCompare ? "アリア確認中..." : "アリアに週比較をもらう"}
          </button>
        </div>
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

      <section className="card compare-card">
        <h2 className="plain-title">今週 vs 先週</h2>
        {compare ? (
          <div className="aria-compare-bubble">{compare.aria_comment}</div>
        ) : (
          <p className="no-data">必要な時だけアリアに比較してもらえます。</p>
        )}
      </section>
    </div>
  );
}
