import { useEffect, useMemo, useState } from "react";
import {
  FieldSummary,
  fetchTimeAnalysis,
  TimeAnalysis as TimeAnalysisData,
  TimeAnalysisSection,
  TimeCategoryTotal,
} from "../api/calendar";
import "./TimeAnalysis.css";

const CUMULATIVE_SCALE_MINUTES = 100 * 60;

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function GrowthRows({ categories, scaleMinutes }: { categories: TimeCategoryTotal[]; scaleMinutes: number }) {
  return (
    <div className="growth-rows">
      {categories.map((category) => {
        const width = Math.min(100, (category.minutes / scaleMinutes) * 100);
        return (
          <div className="growth-row" key={category.key}>
            <span className="growth-name">
              <i style={{ background: category.color }} />
              {category.label}
            </span>
            <div className="growth-track" aria-label={`${category.label} ${category.hours.toFixed(1)}時間`}>
              <div className="growth-fill" style={{ width: `${width}%`, background: category.color }} />
            </div>
            <strong>{category.hours.toFixed(1)}h</strong>
          </div>
        );
      })}
    </div>
  );
}

function PeriodGrowth({ title, section }: { title: string; section: TimeAnalysisSection }) {
  return (
    <section className="growth-section">
      <header className="growth-section-head">
        <h2>{title}</h2>
        <span>{section.label}</span>
      </header>
      <GrowthRows categories={section.categories} scaleMinutes={section.scale_minutes} />
    </section>
  );
}

function CumulativeGrowth({ summary }: { summary: FieldSummary }) {
  const level = summary.level;
  return (
    <section className="growth-section cumulative-growth">
      <header className="growth-section-head">
        <h2>累計成長記録</h2>
        <span>
          Lv{level.level} {level.title} ・ {summary.total_hours.toFixed(1)}h
        </span>
      </header>
      <GrowthRows categories={summary.categories} scaleMinutes={CUMULATIVE_SCALE_MINUTES} />
      {level.next_title && level.remaining_minutes != null && (
        <p className="growth-next">あと{(level.remaining_minutes / 60).toFixed(1)}hで「{level.next_title}」</p>
      )}
    </section>
  );
}

export default function TimeAnalysis({ embedded = false }: { embedded?: boolean }) {
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
    <div className={`time-analysis-page ${embedded ? "embedded" : ""}`}>
      <label className="growth-date">
        <span>日付</span>
        <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
      </label>

      {loading && <p className="growth-loading">読み込み中...</p>}

      {analysis && (
        <div className="growth-stack">
          <PeriodGrowth title="今週の畑" section={analysis.weekly} />
          <PeriodGrowth title="今月の畑" section={analysis.monthly} />
          <CumulativeGrowth summary={analysis.field_summary} />
        </div>
      )}
    </div>
  );
}
