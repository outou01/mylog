import { useEffect, useState } from "react";
import { fetchWeeklyReport, WeeklyReport as IWeeklyReport } from "../api/client";
import "./WeeklyReport.css";

const MOOD_BAR = (score: number) => {
  const pct = (score / 5) * 100;
  const color = score >= 4 ? "var(--green)" : score >= 3 ? "#60a5fa" : "var(--red)";
  return { pct, color };
};

export default function WeeklyReport() {
  const [report, setReport] = useState<IWeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchWeeklyReport()
      .then(setReport)
      .catch(() => setError("レポートの取得に失敗しました。ログを記録してから試してください。"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="wr-loading">Loading...</div>;
  if (error || !report) return <div className="wr-loading">{error}</div>;

  const { stats } = report;
  const mood = MOOD_BAR(stats.avg_mood);

  return (
    <div className="wr-page">
      <div className="wr-header">
        <h1 className="page-title">週次レポート</h1>
        <span className="wr-period">{stats.week_start} 〜 {stats.week_end}</span>
      </div>

      <div className="wr-grid">

        {/* 統計カード */}
        <div className="card wr-stats">
          <div className="wr-section-title">TODAY'S STATS</div>
          <div className="wr-stat-list">
            <div className="wr-stat-row">
              <span className="wr-stat-label">記録日数</span>
              <span className="wr-stat-val mono">{stats.log_count} / 7日</span>
            </div>
            <div className="wr-stat-row">
              <span className="wr-stat-label">平均睡眠</span>
              <span className="wr-stat-val mono" style={{ color: stats.avg_sleep >= 7 ? "var(--green)" : stats.avg_sleep >= 6 ? "var(--yellow)" : "var(--red)" }}>
                {stats.avg_sleep}h
              </span>
            </div>
            <div className="wr-stat-row">
              <span className="wr-stat-label">平均気分</span>
              <div className="wr-mood-bar-wrap">
                <div className="wr-mood-track">
                  <div className="wr-mood-fill" style={{ width: `${mood.pct}%`, background: mood.color }} />
                </div>
                <span className="wr-stat-val mono" style={{ color: mood.color }}>{stats.avg_mood}</span>
              </div>
            </div>
            <div className="wr-stat-row">
              <span className="wr-stat-label">平均残業</span>
              <span className="wr-stat-val mono" style={{ color: stats.avg_overtime >= 2 ? "var(--red)" : "var(--text)" }}>
                {stats.avg_overtime}h
              </span>
            </div>
          </div>

          <div className="wr-habits">
            <div className="wr-section-title" style={{ marginTop: "1rem" }}>習慣達成</div>
            <div className="wr-habit-grid">
              <div className={`wr-habit ${stats.workout_days >= 2 ? "achieved" : ""}`}>
                <span className="wr-habit-icon">💪</span>
                <span className="wr-habit-count">{stats.workout_days}回</span>
                <span className="wr-habit-label">筋トレ</span>
                <span className="wr-habit-target">目標: 週2</span>
              </div>
              <div className={`wr-habit ${stats.create_days >= 3 ? "achieved" : ""}`}>
                <span className="wr-habit-icon">🎨</span>
                <span className="wr-habit-count">{stats.create_days}日</span>
                <span className="wr-habit-label">創作</span>
                <span className="wr-habit-target">目標: 週3〜4</span>
              </div>
              <div className={`wr-habit ${stats.code_days >= 3 ? "achieved" : ""}`}>
                <span className="wr-habit-icon">💻</span>
                <span className="wr-habit-count">{stats.code_days}日</span>
                <span className="wr-habit-label">開発</span>
                <span className="wr-habit-target">目標: 継続</span>
              </div>
              <div className={`wr-habit ${stats.alcohol_days === 0 ? "achieved" : "failed"}`}>
                <span className="wr-habit-icon">🍺</span>
                <span className="wr-habit-count">{stats.alcohol_days}日</span>
                <span className="wr-habit-label">飲酒</span>
                <span className="wr-habit-target">目標: 0日</span>
              </div>
            </div>
          </div>
        </div>

        {/* AIレビュー */}
        <div className="wr-review">
          <div className="card wr-review-card">
            <div className="wr-ai-header">
              <span className="ai-badge">WEEKLY REVIEW</span>
            </div>

            <div className="wr-review-section">
              <div className="wr-review-label">✅ 今週良かったこと</div>
              <p>{report.good_things}</p>
            </div>

            <div className="wr-review-section">
              <div className="wr-review-label">📈 今週進んだこと</div>
              <p>{report.progress}</p>
            </div>

            <div className="wr-review-section highlight">
              <div className="wr-review-label">🎯 来週やること（1つだけ）</div>
              <p className="next-action">{report.next_action}</p>
            </div>

            <div className="wr-review-section">
              <div className="wr-review-label">★ 今週の一言</div>
              <p className="advice">{report.advice}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
