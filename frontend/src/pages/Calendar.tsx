import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchMonthCalendar, fetchWeekCompare, fetchWeeklyHours, fetchPatterns,
  DayCell, WeekCompare, WeekHoursCompare, PatternInsight,
} from "../api/calendar";
import "./Calendar.css";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
const MOOD_COLOR: Record<number, string> = {
  1: "#ef4444", 2: "#f97316", 3: "#6b7280", 4: "#60a5fa", 5: "#4ade80",
};
const ENERGY_LABEL: Record<number, string> = { 1: "疲", 2: "普", 3: "元" };

const ACTIVITY_LABELS: { key: keyof WeekHoursCompare["this_week"]; label: string; color: string }[] = [
  { key: "create_hours", label: "🎨 創作", color: "#a78bfa" },
  { key: "workout_hours", label: "💪 筋トレ", color: "#4ade80" },
  { key: "code_hours", label: "💻 開発", color: "#60a5fa" },
  { key: "study_hours", label: "📚 勉強", color: "#fbbf24" },
  { key: "job_search_hours", label: "💼 転職活動", color: "#f97316" },
];

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function HoursBar({ thisVal, lastVal, label, color }: { thisVal: number; lastVal: number; label: string; color: string }) {
  const max = Math.max(thisVal, lastVal, 1);
  const diff = Math.round((thisVal - lastVal) * 10) / 10;
  const improved = diff > 0;
  return (
    <div className="hours-bar-row">
      <div className="hours-bar-label">{label}</div>
      <div className="hours-bar-tracks">
        <div className="hours-bar-track">
          <div className="hours-bar-fill" style={{ width: `${(thisVal / max) * 100}%`, background: color }} />
          <span className="hours-bar-val">{thisVal}h</span>
        </div>
        <div className="hours-bar-track last">
          <div className="hours-bar-fill" style={{ width: `${(lastVal / max) * 100}%`, background: color, opacity: 0.35 }} />
          <span className="hours-bar-val muted">{lastVal}h</span>
        </div>
      </div>
      {diff !== 0 && (
        <div className={`hours-diff-badge ${improved ? "improved" : "worsened"}`}>
          {improved ? "+" : ""}{diff}h
        </div>
      )}
    </div>
  );
}

function StatDiff({ label, thisVal, lastVal, unit = "", higherIsBetter = true }: {
  label: string; thisVal: number; lastVal: number; unit?: string; higherIsBetter?: boolean;
}) {
  const diff = Math.round((thisVal - lastVal) * 10) / 10;
  const improved = higherIsBetter ? diff > 0 : diff < 0;
  const sign = diff > 0 ? "+" : "";
  return (
    <div className="stat-diff">
      <div className="stat-diff-label">{label}</div>
      <div className="stat-diff-values">
        <span className="stat-this">{thisVal}{unit}</span>
        <span className="stat-last">先週: {lastVal}{unit}</span>
      </div>
      {diff !== 0 && (
        <div className={`stat-diff-badge ${improved ? "improved" : "worsened"}`}>
          {sign}{diff}{unit}
        </div>
      )}
    </div>
  );
}

type Tab = "calendar" | "hours" | "patterns";

export default function Calendar() {
  const navigate = useNavigate();
  const today = localToday();
  const todayDate = new Date(today);

  const [tab, setTab] = useState<Tab>("calendar");
  const [year, setYear] = useState(todayDate.getFullYear());
  const [month, setMonth] = useState(todayDate.getMonth() + 1);
  const [cells, setCells] = useState<DayCell[]>([]);
  const [compare, setCompare] = useState<WeekCompare | null>(null);
  const [hours, setHours] = useState<WeekHoursCompare | null>(null);
  const [patterns, setPatterns] = useState<PatternInsight | null>(null);
  const [loadingHours, setLoadingHours] = useState(false);
  const [loadingPatterns, setLoadingPatterns] = useState(false);

  useEffect(() => {
    fetchMonthCalendar(year, month).then(setCells);
  }, [year, month]);

  useEffect(() => {
    fetchWeekCompare().then(setCompare);
  }, []);

  useEffect(() => {
    if (tab === "hours" && !hours) {
      setLoadingHours(true);
      fetchWeeklyHours().then(setHours).finally(() => setLoadingHours(false));
    }
    if (tab === "patterns" && !patterns) {
      setLoadingPatterns(true);
      fetchPatterns().then(setPatterns).finally(() => setLoadingPatterns(false));
    }
  }, [tab, hours, patterns]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const blanks = Array(offset).fill(null);

  return (
    <div className="calendar-page">

      {/* タブ */}
      <div className="cal-tabs">
        <button className={`cal-tab ${tab === "calendar" ? "active" : ""}`} onClick={() => setTab("calendar")}>📅 カレンダー</button>
        <button className={`cal-tab ${tab === "hours" ? "active" : ""}`} onClick={() => setTab("hours")}>⏱ 時間グラフ</button>
        <button className={`cal-tab ${tab === "patterns" ? "active" : ""}`} onClick={() => setTab("patterns")}>🔍 パターン分析</button>
      </div>

      {/* カレンダータブ */}
      {tab === "calendar" && (
        <>
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
                const dow = d.getDay();
                const isToday = cell.date === today;
                const isWeekend = dow === 0 || dow === 6;
                const moodColor = cell.mood_score ? MOOD_COLOR[cell.mood_score] : undefined;
                return (
                  <div key={cell.date}
                    className={`cal-cell ${cell.has_log ? "has-log" : ""} ${isToday ? "today" : ""} ${isWeekend ? "weekend" : ""}`}
                    style={moodColor && cell.has_log ? { borderColor: moodColor } : undefined}
                    onClick={() => cell.has_log ? navigate("/logs") : navigate("/log")}>
                    <div className="cal-day-num">{dayNum}</div>
                    {cell.has_log && (
                      <>
                        <div className="cal-mood-dot" style={{ background: moodColor }} />
                        {cell.energy_level && <div className={`cal-energy energy-${cell.energy_level}`}>{ENERGY_LABEL[cell.energy_level]}</div>}
                        <div className="cal-flags">
                          {cell.did_workout && <span>💪</span>}
                          {cell.did_create && <span>🎨</span>}
                          {cell.victory_achieved && <span>🎯</span>}
                        </div>
                        {cell.sleep_hours != null && <div className="cal-sleep">{cell.sleep_hours}h</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="cal-legend">
              {[5, 4, 3, 2, 1].map(n => (
                <div key={n} className="legend-item">
                  <span className="legend-dot" style={{ background: MOOD_COLOR[n] }} />気分{n}
                </div>
              ))}
            </div>
          </div>

          {/* 今週vs先週サマリー */}
          {compare && (
            <div className="card compare-card">
              <div className="compare-title">📊 今週 vs 先週</div>
              <div className="aria-compare-bubble">
                <span className="aria-mini-face">(＾ω＾) アリア</span>
                <p>{compare.aria_comment}</p>
              </div>
              <div className="compare-grid">
                <StatDiff label="平均睡眠" thisVal={compare.this_week.avg_sleep} lastVal={compare.last_week.avg_sleep} unit="h" />
                <StatDiff label="平均気分" thisVal={compare.this_week.avg_mood} lastVal={compare.last_week.avg_mood} unit="/5" />
                <StatDiff label="筋トレ" thisVal={compare.this_week.workout_days} lastVal={compare.last_week.workout_days} unit="日" />
                <StatDiff label="創作" thisVal={compare.this_week.create_days} lastVal={compare.last_week.create_days} unit="日" />
                <StatDiff label="回復活動" thisVal={compare.this_week.recovery_days} lastVal={compare.last_week.recovery_days} unit="日" />
                <StatDiff label="飲酒" thisVal={compare.this_week.alcohol_days} lastVal={compare.last_week.alcohol_days} unit="日" higherIsBetter={false} />
              </div>
            </div>
          )}
        </>
      )}

      {/* 時間グラフタブ */}
      {tab === "hours" && (
        <div className="card hours-card">
          <div className="hours-title">⏱ 活動時間（今週 vs 先週）</div>
          {loadingHours ? (
            <div className="loading">集計中...</div>
          ) : hours ? (
            <>
              <div className="hours-total-row">
                <div className="hours-total-item">
                  <div className="hours-total-val">{hours.this_week.total_advance_hours}h</div>
                  <div className="hours-total-label">今週合計</div>
                </div>
                <div className="hours-total-arrow">vs</div>
                <div className="hours-total-item muted">
                  <div className="hours-total-val">{hours.last_week.total_advance_hours}h</div>
                  <div className="hours-total-label">先週合計</div>
                </div>
                {hours.this_week.total_advance_hours !== hours.last_week.total_advance_hours && (
                  <div className={`hours-total-diff ${hours.this_week.total_advance_hours > hours.last_week.total_advance_hours ? "improved" : "worsened"}`}>
                    {hours.this_week.total_advance_hours > hours.last_week.total_advance_hours ? "+" : ""}
                    {Math.round((hours.this_week.total_advance_hours - hours.last_week.total_advance_hours) * 10) / 10}h
                  </div>
                )}
              </div>

              <div className="hours-legend">
                <span className="hours-legend-item"><span className="hours-dot full" />今週</span>
                <span className="hours-legend-item"><span className="hours-dot muted" />先週</span>
              </div>

              <div className="hours-bars">
                {ACTIVITY_LABELS.map(({ key, label, color }) => (
                  <HoursBar
                    key={key}
                    label={label}
                    thisVal={hours.this_week[key] as number}
                    lastVal={hours.last_week[key] as number}
                    color={color}
                  />
                ))}
              </div>

              <div className="hours-week-range">
                今週: {hours.week_start} 〜 ／ 先週: {hours.last_week_start} 〜
              </div>
            </>
          ) : <p className="no-data">データがありません</p>}
        </div>
      )}

      {/* パターン分析タブ */}
      {tab === "patterns" && (
        <div className="card patterns-card">
          <div className="patterns-title">🔍 あなたの人生パターン分析</div>
          {loadingPatterns ? (
            <div className="loading">アリアが分析中...</div>
          ) : patterns ? (
            <>
              <div className="aria-compare-bubble">
                <span className="aria-mini-face">(＾ω＾) アリア</span>
                <p>{patterns.aria_comment}</p>
              </div>
              <div className="patterns-list">
                {patterns.insights.map((insight, i) => (
                  <div key={i} className="pattern-item">
                    <span className="pattern-num">{i + 1}</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
              <div className="patterns-note">※ 過去30日のデータに基づく分析です</div>
            </>
          ) : <p className="no-data">データがありません</p>}
        </div>
      )}

    </div>
  );
}
