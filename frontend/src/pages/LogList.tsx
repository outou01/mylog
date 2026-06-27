import { useEffect, useState } from "react";
import { fetchLogs, generateReview, DailyLog } from "../api/client";
import "./LogList.css";

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

export default function LogList() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<number | null>(null);

  useEffect(() => {
    fetchLogs().then(setLogs).finally(() => setLoading(false));
  }, []);

  const handleReview = async (log: DailyLog) => {
    setReviewing(log.id);
    try {
      const review = await generateReview(log.id);
      setLogs((prev) => prev.map((l) => l.id === log.id ? { ...l, ai_review: review } : l));
    } finally {
      setReviewing(null);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (logs.length === 0) return <div className="loading">ログがまだありません。</div>;

  return (
    <div className="log-list-page">
      <h1 className="page-title">ログ一覧</h1>
      <div className="log-cards">
        {logs.map((log) => (
          <div key={log.id} className="card log-entry">
            <div className="log-entry-header">
              <span className="log-date">{log.date}</span>
              <span className="log-mood">{MOOD_EMOJI[log.mood_score]} {log.mood_score}/5</span>
            </div>

            <div className="log-entry-stats">
              <span>😴 {log.sleep_hours}h</span>
              <span>⏰ 残業 {log.overtime_hours}h</span>
              {log.did_workout && <span className="badge green">筋トレ</span>}
              {log.did_create && <span className="badge purple">創作</span>}
              {log.did_code && <span className="badge blue">開発</span>}
              {log.drank_alcohol && <span className="badge yellow">飲酒</span>}
            </div>

            {log.memo && <p className="log-memo">{log.memo}</p>}

            {log.ai_review ? (
              <div className="log-review">
                <div className="review-stats">
                  <span>HP <strong style={{ color: "var(--green)" }}>{log.ai_review.hp}</strong></span>
                  <span>MP <strong style={{ color: "#60a5fa" }}>{log.ai_review.mp}</strong></span>
                  <span>Stress <strong style={{ color: "var(--red)" }}>{log.ai_review.stress}%</strong></span>
                </div>
                <p className="review-comment">{log.ai_review.comment}</p>
              </div>
            ) : (
              <button className="btn btn-accent btn-sm log-review-btn"
                onClick={() => handleReview(log)} disabled={reviewing === log.id}>
                {reviewing === log.id ? "分析中..." : "AIレビュー生成"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
