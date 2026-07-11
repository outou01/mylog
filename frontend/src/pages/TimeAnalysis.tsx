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

const FIELD_DEFINITIONS = [
  { key: "body", name: "身体", icon: "💪", color: "#f9734a", categories: ["workout"] },
  { key: "knowledge", name: "知識", icon: "📚", color: "#5d9cec", categories: ["reading", "job_search"] },
  { key: "creation", name: "創作", icon: "🎨", color: "#a970d6", categories: ["creation"] },
  { key: "mind", name: "心", icon: "🧘", color: "#9fc9d8", categories: ["meditation"] },
  { key: "social", name: "交流", icon: "🤝", color: "#58b77b", categories: ["social"] },
] as const;

type FieldGrowth = {
  key: string;
  name: string;
  icon: string;
  color: string;
  minutes: number;
  hours: number;
  percent: number;
  label: string;
};

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function growthLabel(percent: number) {
  if (percent >= 80) return "よく育っている";
  if (percent >= 60) return "安定している";
  if (percent >= 40) return "芽が出ている";
  if (percent >= 20) return "少し育っている";
  return "これから育つ";
}

function toFields(categories: TimeCategoryTotal[], scaleMinutes: number): FieldGrowth[] {
  return FIELD_DEFINITIONS.map((field) => {
    const minutes = categories
      .filter((category) => (field.categories as readonly string[]).includes(category.key))
      .reduce((total, category) => total + category.minutes, 0);
    const percent = Math.min(100, Math.round((minutes / scaleMinutes) * 100));
    return {
      key: field.key,
      name: field.name,
      icon: field.icon,
      color: field.color,
      minutes,
      hours: minutes / 60,
      percent,
      label: growthLabel(percent),
    };
  });
}

function SoilFieldList({ fields }: { fields: FieldGrowth[] }) {
  return (
    <div className="soil-field-list">
      {fields.map((field) => (
        <div className="soil-field-row" key={field.key}>
          <div className="soil-field-main">
            <span className="soil-field-name">{field.icon} {field.name}</span>
            <div className="soil-bar-track" aria-label={`${field.name} ${field.hours.toFixed(1)}時間`}>
              <div className="soil-bar-fill" style={{ width: `${field.percent}%`, background: field.color }} />
            </div>
          </div>
          <div className="soil-field-side">
            <strong>{field.hours.toFixed(1)}h</strong>
            <span>{field.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PeriodField({ title, section }: { title: string; section: TimeAnalysisSection }) {
  return (
    <section className="soil-growth-section">
      <header className="soil-growth-head">
        <h2>{title}</h2>
        <span>{section.label}</span>
      </header>
      <SoilFieldList fields={toFields(section.categories, section.scale_minutes)} />
    </section>
  );
}

function CumulativeField({ summary }: { summary: FieldSummary }) {
  const level = summary.level;
  return (
    <section className="soil-growth-section">
      <header className="soil-growth-head">
        <h2>累計成長記録</h2>
        <span>Lv{level.level} {level.title} ・ {summary.total_hours.toFixed(1)}h</span>
      </header>
      <SoilFieldList fields={toFields(summary.categories, CUMULATIVE_SCALE_MINUTES)} />
      {level.next_title && level.remaining_minutes != null && (
        <p className="soil-growth-next">あと{(level.remaining_minutes / 60).toFixed(1)}hで「{level.next_title}」</p>
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
      <label className="soil-growth-date">
        <span>日付</span>
        <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
      </label>

      {loading && <p className="soil-growth-loading">読み込み中...</p>}

      {analysis && (
        <div className="soil-growth-stack">
          <PeriodField title="今週の畑" section={analysis.weekly} />
          <PeriodField title="今月の畑" section={analysis.monthly} />
          <CumulativeField summary={analysis.field_summary} />
        </div>
      )}
    </div>
  );
}
