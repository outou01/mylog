import { useEffect, useMemo, useState } from "react";
import {
  createTimeAnalysisComment,
  fetchTimeAnalysis,
  TimeAnalysis as TimeAnalysisData,
  TimeAnalysisComment,
  TimeAnalysisSection,
} from "../api/calendar";
import "./TimeAnalysis.css";

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function totalHours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

function AnalysisSection({
  title,
  scope,
  section,
  comment,
  requesting,
  onRequestComment,
}: {
  title: string;
  scope: TimeAnalysisComment["scope"];
  section: TimeAnalysisSection;
  comment: TimeAnalysisComment | undefined;
  requesting: boolean;
  onRequestComment: (scope: TimeAnalysisComment["scope"]) => void;
}) {
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
          const rawWidth = (category.minutes / section.scale_minutes) * 100;
          const width = category.minutes === 0 ? 0 : Math.max(1, Math.min(100, rawWidth));
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

      <div className="scale-note">
        <span>0h</span>
        <span>右端 {section.scale_label}</span>
      </div>

      <div className="aria-analysis">
        {comment ? <p>{comment.comment}</p> : <p className="muted">アリアの感想は必要な時だけ呼び出せます。</p>}
        <button className="aria-comment-btn" type="button" onClick={() => onRequestComment(scope)} disabled={requesting}>
          {requesting ? "アリア確認中..." : "アリアに感想をもらう"}
        </button>
      </div>
    </section>
  );
}

export default function TimeAnalysis({ embedded = false }: { embedded?: boolean }) {
  const today = useMemo(() => localDate(), []);
  const [targetDate, setTargetDate] = useState(today);
  const [analysis, setAnalysis] = useState<TimeAnalysisData | null>(null);
  const [comments, setComments] = useState<Partial<Record<TimeAnalysisComment["scope"], TimeAnalysisComment>>>({});
  const [requestingScope, setRequestingScope] = useState<TimeAnalysisComment["scope"] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setComments({});
    fetchTimeAnalysis(targetDate)
      .then(setAnalysis)
      .finally(() => setLoading(false));
  }, [targetDate]);

  const requestComment = async (scope: TimeAnalysisComment["scope"]) => {
    setRequestingScope(scope);
    try {
      const comment = await createTimeAnalysisComment(scope, targetDate);
      setComments((current) => ({ ...current, [scope]: comment }));
    } finally {
      setRequestingScope(null);
    }
  };

  return (
    <div className={`time-analysis-page ${embedded ? "embedded" : ""}`}>
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
          <AnalysisSection
            title="日次"
            scope="daily"
            section={analysis.daily}
            comment={comments.daily}
            requesting={requestingScope === "daily"}
            onRequestComment={requestComment}
          />
          <AnalysisSection
            title="週次"
            scope="weekly"
            section={analysis.weekly}
            comment={comments.weekly}
            requesting={requestingScope === "weekly"}
            onRequestComment={requestComment}
          />
          <AnalysisSection
            title="月次"
            scope="monthly"
            section={analysis.monthly}
            comment={comments.monthly}
            requesting={requestingScope === "monthly"}
            onRequestComment={requestComment}
          />
        </div>
      )}
    </div>
  );
}
