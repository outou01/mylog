import { useState } from "react";
import { fetchPatterns, PatternInsight } from "../api/calendar";
import "./Calendar.css";

export default function PatternAnalysis() {
  const [patterns, setPatterns] = useState<PatternInsight | null>(null);
  const [loading, setLoading] = useState(false);

  const requestAnalysis = async () => {
    setLoading(true);
    try {
      const data = await fetchPatterns();
      setPatterns(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="calendar-page">
      <section className="card patterns-card">
        <div className="schedule-head">
          <div>
            <p className="schedule-kicker">私生活分析</p>
            <h2 className="plain-title">パターン分析</h2>
          </div>
          <button className="schedule-btn quick" type="button" onClick={requestAnalysis} disabled={loading}>
            {loading ? "アリア分析中..." : "アリアに分析してもらう"}
          </button>
        </div>

        {patterns ? (
          <>
            <div className="aria-compare-bubble">{patterns.aria_comment}</div>
            <div className="patterns-list">
              {patterns.insights.map((insight, i) => (
                <div key={i} className="pattern-item">
                  <span className="pattern-num">{i + 1}</span>
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="no-data">分析は必要な時だけ実行します。Geminiの上限を使いすぎないため、開いただけでは通信しません。</p>
        )}
      </section>
    </div>
  );
}
