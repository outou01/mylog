import { useEffect, useMemo, useState } from "react";
import { fetchTimeAnalysis, TimeAnalysis as TimeAnalysisData, TimeAnalysisSection } from "../api/calendar";
import "./TimeAnalysis.css";

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sectionMax(section: TimeAnalysisSection) {
  return Math.max(60, ...section.categories.map((category) => category.minutes));
}

function totalHours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

function AnalysisSection({ title, section }: { title: string; section: TimeAnalysisSection }) {
  const maxMinutes = sectionMax(section);

  return (
    <section className="analysis-card">
      <div className="analysis-section-head">
        <div>
          <p className="analysis-kicker">{title}</p>
          <h2>{section.label}</h2>
        </div>
        <div className="analysis-total">{totalHours(section.total_minutes)}h</div>
      </div>

      <div className="bar-list">
        {section.categories.map((category) => {
          const width = Math.max(2, (category.minutes / maxMinutes) * 100);
          return (
            <div className="bar-row" key={category.key}>
              <div className="bar-name">
                <span className="bar-dot" style={{ background: category.color }} />
                {category.label}
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${width}%`,
                    background: category.color,
                  }}
                />
              </div>
              <div className="bar-value">{category.hours.toFixed(1)}h</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function TimeAnalysis() {
  const today = useMemo(() => localDate(), []);
  const [targetDate, setTargetDate] = useState(today);
  const [analysis, setAnalysis] = useState<TimeAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchTimeAnalysis(targetDate)
      .then(setAnalysis)
      .finally(() => setLoading(false));
  }, [targetDate]);

  return (
    <div className="time-analysis-page">
      <section className="analysis-hero">
        <div>
          <p className="analysis-kicker">時間分析</p>
          <h1>私生活の実績</h1>
        </div>
        <label className="analysis-date">
          日付
          <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
        </label>
      </section>

      {loading && <p className="analysis-loading">読み込み中...</p>}

      {analysis && (
        <div className="analysis-stack">
          <AnalysisSection title="日次" section={analysis.daily} />
          <AnalysisSection title="週次" section={analysis.weekly} />
          <AnalysisSection title="月次" section={analysis.monthly} />
        </div>
      )}
    </div>
  );
}
