import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMonthCalendar, fetchWeekCompare, DayCell, WeekCompare } from "../api/calendar";
import "./Calendar.css";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

const MOOD_COLOR: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#6b7280",
  4: "#60a5fa",
  5: "#4ade80",
};

const ENERGY_LABEL: Record<number, string> = { 1: "疲", 2: "普", 3: "元" };

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StatDiff({ label, thisVal, lastVal, unit = "", higherIsBetter = true }: {
  label: string; thisVal: number; lastVal: number; unit?: string; higherIsBetter?: boolean;
}) {
  const diff = Math.round((thisVal - lastVal) * 10) / 10;
  const improved = higherIsBetter ? diff > 0 : diff < 0;
  const worsened = higherIsBetter ? diff < 0 : diff > 0;
  const sign = diff > 0 ? "+" : "";
  return (
    <div className="stat-diff">
      <div className="stat-diff-label">{label}</div>
      <div className="stat-diff-values">
        <span className="stat-this">{thisVal}{unit}</span>
        <span className="stat-last">先週: {lastVal}{unit}</span>
      </div>
      {diff !== 0 && (
        <div className={`stat-diff-badge ${improved ? "improved" : worsened ? "worsened" : ""}`}>
          {sign}{diff}{unit}
        </div>
      )}
    </div>
  );
}

export default function Calendar() {
  const navigate = useNavigate();
  const today = localToday();
  const todayDate = new Date(today);

  const [year, setYear] = useState(todayDate.getFullYear());
  const [month, setMonth] = useState(todayDate.getMonth() + 1);
  const [cells, setCells] = useState<DayCell[]>([]);
  const [compare, setCompare] = useState<WeekCompare | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(true);

  useEffect(() => {
    fetchMonthCalendar(year, month).then(setCells);
  }, [year, month]);

  useEffect(() => {
    fetchWeekCompare().then(setCompare).finally(() => setLoadingCompare(false));
  }, []);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  // 月の最初の曜日オフセット（月曜始まり）
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const blanks = Array(offset).fill(null);

  const handleDayClick = (cell: DayCell) => {
    if (cell.has_log) {
      // ログ一覧から修正に飛ばす（日付で探す必要があるため一覧へ）
      navigate("/logs");
    } else {
      navigate("/log");
    }
  };

  return (
    <div className="calendar-page">

      {/* 月間カレンダー */}
      <div className="card cal-card">
        <div className="cal-header">
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
          <h2 className="cal-title">{year}年 {month}月</h2>
          <button className="cal-nav-btn" onClick={nextMonth}>›</button>
        </div>

        <div className="cal-grid-header">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`cal-wday ${i >= 5 ? "weekend" : ""}`}>{d}</div>
          ))}
        </div>

        <div className="cal-grid">
          {blanks.map((_, i) => <div key={`b${i}`} className="cal-cell empty" />)}
          {cells.map((cell) => {
            const d = new Date(cell.date);
            const dayNum = d.getDate();
            const dow = d.getDay(); // 0=Sun
            const isToday = cell.date === today;
            const isWeekend = dow === 0 || dow === 6;
            const moodColor = cell.mood_score ? MOOD_COLOR[cell.mood_score] : undefined;

            return (
              <div
                key={cell.date}
                className={`cal-cell ${cell.has_log ? "has-log" : ""} ${isToday ? "today" : ""} ${isWeekend ? "weekend" : ""}`}
                style={moodColor && cell.has_log ? { borderColor: moodColor } : undefined}
                onClick={() => handleDayClick(cell)}
              >
                <div className="cal-day-num">{dayNum}</div>
                {cell.has_log && (
                  <>
                    <div className="cal-mood-dot" style={{ background: moodColor }} />
                    {cell.energy_level && (
                      <div className={`cal-energy energy-${cell.energy_level}`}>{ENERGY_LABEL[cell.energy_level]}</div>
                    )}
                    <div className="cal-flags">
                      {cell.did_workout && <span title="筋トレ">💪</span>}
                      {cell.did_create && <span title="創作">🎨</span>}
                      {cell.victory_achieved && <span title="勝利条件クリア">🎯</span>}
                    </div>
                    {cell.sleep_hours != null && (
                      <div className="cal-sleep">{cell.sleep_hours}h</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="cal-legend">
          <div className="legend-item"><span className="legend-dot" style={{ background: MOOD_COLOR[5] }} />気分5</div>
          <div className="legend-item"><span className="legend-dot" style={{ background: MOOD_COLOR[4] }} />気分4</div>
          <div className="legend-item"><span className="legend-dot" style={{ background: MOOD_COLOR[3] }} />気分3</div>
          <div className="legend-item"><span className="legend-dot" style={{ background: MOOD_COLOR[2] }} />気分2</div>
          <div className="legend-item"><span className="legend-dot" style={{ background: MOOD_COLOR[1] }} />気分1</div>
        </div>
      </div>

      {/* 今週vs先週 */}
      <div className="card compare-card">
        <div className="compare-header">
          <span className="compare-title">📊 今週 vs 先週</span>
        </div>

        {loadingCompare ? (
          <div className="loading">分析中...</div>
        ) : compare ? (
          <>
            {/* Ariaコメント */}
            <div className="aria-compare-bubble">
              <span className="aria-mini-face">(＾ω＾) アリア</span>
              <p>{compare.aria_comment}</p>
            </div>

            {/* 比較グリッド */}
            <div className="compare-grid">
              <StatDiff label="平均睡眠" thisVal={compare.this_week.avg_sleep} lastVal={compare.last_week.avg_sleep} unit="h" />
              <StatDiff label="平均気分" thisVal={compare.this_week.avg_mood} lastVal={compare.last_week.avg_mood} unit="/5" />
              <StatDiff label="エネルギー" thisVal={compare.this_week.avg_energy} lastVal={compare.last_week.avg_energy} unit="/3" />
              <StatDiff label="筋トレ" thisVal={compare.this_week.workout_days} lastVal={compare.last_week.workout_days} unit="日" />
              <StatDiff label="創作" thisVal={compare.this_week.create_days} lastVal={compare.last_week.create_days} unit="日" />
              <StatDiff label="回復活動" thisVal={compare.this_week.recovery_days} lastVal={compare.last_week.recovery_days} unit="日" />
              <StatDiff label="飲酒" thisVal={compare.this_week.alcohol_days} lastVal={compare.last_week.alcohol_days} unit="日" higherIsBetter={false} />
              <StatDiff label="記録日数" thisVal={compare.this_week.log_count} lastVal={compare.last_week.log_count} unit="日" />
            </div>

            <div className="compare-weeks">
              <div className="compare-week-label">今週: {compare.this_week.week_start} 〜 {compare.this_week.week_end}</div>
              <div className="compare-week-label">先週: {compare.last_week.week_start} 〜 {compare.last_week.week_end}</div>
            </div>
          </>
        ) : (
          <p className="no-data">データがまだありません</p>
        )}
      </div>

    </div>
  );
}
