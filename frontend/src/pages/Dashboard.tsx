import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DailyLog, AiReview, fetchLatestLog, generateReview } from "../api/client";
import StatBar from "../components/StatBar";
import Aria from "../components/Aria";
import "./Dashboard.css";

const MOOD_LABEL: Record<number, string> = { 1: "最悪", 2: "悪い", 3: "普通", 4: "良い", 5: "最高" };

export default function Dashboard() {
  const [log, setLog] = useState<DailyLog | null>(null);
  const [review, setReview] = useState<AiReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchLatestLog()
      .then((l) => {
        setLog(l);
        setReview(l.ai_review);
      })
      .catch(() => setError("ログがまだありません。まずログを登録してください。"))
      .finally(() => setLoading(false));
  }, []);

  const handleReview = async () => {
    if (!log) return;
    setReviewing(true);
    try {
      const r = await generateReview(log.id);
      setReview(r);
    } finally {
      setReviewing(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error || !log) return (
    <div className="empty-state">
      <p>{error}</p>
      <Link to="/log" className="btn btn-primary" style={{ marginTop: "1rem" }}>今日のログを登録する</Link>
    </div>
  );

  const hp = review?.hp ?? 50;
  const mp = review?.mp ?? 50;
  const stress = review?.stress ?? 50;

  return (
    <div className="dashboard">
      <div className="dashboard-grid">
        <div className="card status-card">
          <div className="player-header">
            <div className="player-level">Lv.<span>1</span></div>
            <div className="player-name">Naoya</div>
            <div className="player-date">{log.date}</div>
          </div>

          <div className="stats">
            <StatBar label="HP" value={hp} color="var(--green)" />
            <StatBar label="MP" value={mp} color="#60a5fa" />
            <StatBar label="Stress" value={stress} color="var(--red)" />
          </div>

          <div className="log-details">
            <div className="detail-row">
              <span>睡眠</span>
              <span className="mono">{log.sleep_hours}h</span>
            </div>
            <div className="detail-row">
              <span>残業</span>
              <span className="mono">{log.overtime_hours}h</span>
            </div>
            <div className="detail-row">
              <span>気分</span>
              <span>{MOOD_LABEL[log.mood_score]} ({log.mood_score}/5)</span>
            </div>
            <div className="flags">
              {log.did_workout && <span className="flag flag-green">筋トレ ✓</span>}
              {log.did_create && <span className="flag flag-purple">創作 ✓</span>}
              {log.did_code && <span className="flag flag-blue">開発 ✓</span>}
              {log.drank_alcohol && <span className="flag flag-yellow">飲酒</span>}
            </div>
          </div>

          {!review && (
            <button className="btn btn-accent" onClick={handleReview} disabled={reviewing} style={{ marginTop: "1rem", width: "100%" }}>
              {reviewing ? "AI分析中..." : "AIレビューを生成する"}
            </button>
          )}
        </div>

        <div className="ai-panel">
          <div className="card aria-card">
            <Aria />
          </div>
          {review ? (
            <div className="card ai-card">
              <div className="ai-header">
                <span className="ai-badge">AI REVIEW</span>
                <button className="btn btn-accent btn-sm" onClick={handleReview} disabled={reviewing}>
                  {reviewing ? "..." : "再生成"}
                </button>
              </div>
              <div className="ai-comment">{review.comment}</div>
              <div className="ai-section">
                <div className="ai-section-label">▶ 明日のアクション</div>
                <div>{review.next_action}</div>
              </div>
              <div className="ai-section">
                <div className="ai-section-label">★ 励まし</div>
                <div className="encouragement">{review.encouragement}</div>
              </div>
            </div>
          ) : (
            <div className="card ai-placeholder">
              <p>AIレビューはまだ生成されていません。</p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                左の「AIレビューを生成する」ボタンをクリックしてください。
              </p>
            </div>
          )}

          {log.memo && (
            <div className="card memo-card">
              <div className="ai-section-label">📝 メモ</div>
              <p>{log.memo}</p>
            </div>
          )}

          <div className="dashboard-actions">
            <Link to="/log" className="btn btn-primary">今日のログを更新</Link>
            <Link to="/logs" className="btn btn-accent">ログ一覧を見る</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
