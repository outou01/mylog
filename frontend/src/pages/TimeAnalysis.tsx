import { useEffect, useMemo, useState } from "react";
import {
  createTimeAnalysisComment,
  FieldSummary,
  fetchTimeAnalysis,
  TimeAnalysis as TimeAnalysisData,
  TimeAnalysisComment,
  TimeAnalysisSection,
} from "../api/calendar";
import "./TimeAnalysis.css";

const SECTION_COPY: Record<TimeAnalysisComment["scope"], { title: string; button: string }> = {
  daily: { title: "今日の畑", button: "今日の畑を見てもらう" },
  weekly: { title: "今週の畑", button: "今週の畑を見てもらう" },
  monthly: { title: "今月の畑", button: "今月の畑を見てもらう" },
};

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

function FieldSummaryCard({ summary }: { summary: FieldSummary }) {
  const level = summary.level;
  const remainingHours = level.remaining_minutes == null ? null : hours(level.remaining_minutes);

  return (
    <section className="field-hero">
      <div className="field-hero-copy">
        <p className="analysis-kicker">累計成長記録</p>
        <h1>自分の畑</h1>
        <p>
          仕事だけに人生を使わないため。
          未来の自分が笑えるように、自分の畑を耕す。
        </p>
      </div>

      <div className="field-summary-panel">
        <div>
          <span className="field-label">累計耕作時間</span>
          <strong>{summary.total_hours.toFixed(1)}h</strong>
        </div>
        <div className="field-level">
          <span>Lv{level.level}</span>
          <strong>{level.title}</strong>
          {level.next_title && remainingHours ? (
            <em>あと{remainingHours}hで「{level.next_title}」</em>
          ) : (
            <em>最大レベルまで育っています</em>
          )}
        </div>
      </div>

      <div className="field-category-totals">
        {summary.categories.map((category) => (
          <div className="field-total-row" key={category.key}>
            <span className="bar-dot" style={{ background: category.color }} />
            <span>{category.label}</span>
            <strong>{category.hours.toFixed(1)}h</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalysisSection({
  scope,
  section,
  comment,
  requesting,
  onRequestComment,
}: {
  scope: TimeAnalysisComment["scope"];
  section: TimeAnalysisSection;
  comment: TimeAnalysisComment | undefined;
  requesting: boolean;
  onRequestComment: (scope: TimeAnalysisComment["scope"]) => void;
}) {
  const copy = SECTION_COPY[scope];

  return (
    <section className="analysis-card">
      <div className="analysis-section-head">
        <div>
          <p className="analysis-kicker">{copy.title}</p>
          <h2>{section.label}</h2>
        </div>
      </div>

      <div className="bar-list">
        {section.categories.map((category) => {
          const rawWidth = (category.minutes / section.scale_minutes) * 100;
          const width = category.minutes === 0 ? 0 : Math.max(4, Math.min(100, rawWidth));
          return (
            <div className="bar-row" key={category.key}>
              <div className="bar-name">
                <span className="bar-dot" style={{ background: category.color }} />
                {category.label}
              </div>
              <div className="bar-track" aria-label={`${category.label} ${category.hours.toFixed(1)}時間`}>
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

      <div className="aria-analysis">
        {comment ? (
          <p>{comment.comment}{comment.is_fallback ? " ※自動生成" : ""}</p>
        ) : (
          <p className="muted">必要な時だけ、アリアにこの畑を見てもらえます。</p>
        )}
        <button className="aria-comment-btn" type="button" onClick={() => onRequestComment(scope)} disabled={requesting}>
          {requesting ? "アリア確認中..." : copy.button}
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
      <section className="analysis-toolbar">
        <div>
          <p className="analysis-kicker">成長ログ</p>
          <h1>畑の成長記録</h1>
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
            scope="daily"
            section={analysis.daily}
            comment={comments.daily}
            requesting={requestingScope === "daily"}
            onRequestComment={requestComment}
          />
          <AnalysisSection
            scope="weekly"
            section={analysis.weekly}
            comment={comments.weekly}
            requesting={requestingScope === "weekly"}
            onRequestComment={requestComment}
          />
          <AnalysisSection
            scope="monthly"
            section={analysis.monthly}
            comment={comments.monthly}
            requesting={requestingScope === "monthly"}
            onRequestComment={requestComment}
          />
          <FieldSummaryCard summary={analysis.field_summary} />
        </div>
      )}
    </div>
  );
}
