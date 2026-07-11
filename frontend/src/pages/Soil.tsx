import { useEffect, useState } from "react";
import { fetchSoilSummary, SoilSummary } from "../api/client";
import "./Soil.css";

export default function Soil() {
  const [summary, setSummary] = useState<SoilSummary | null>(null);

  useEffect(() => {
    fetchSoilSummary().then(setSummary).catch(() => {});
  }, []);

  if (!summary) {
    return <div className="soil-page"><p className="soil-muted">読み込み中...</p></div>;
  }

  return (
    <div className="soil-page">
      <h1 className="soil-title">土壌</h1>

      <section className="soil-field-list" aria-label="畑の状態">
        {summary.categories.map((field) => (
          <div className="soil-field-row" key={field.key}>
            <div className="soil-field-main">
              <span className="soil-field-name">{field.icon} {field.name}</span>
              <div className="soil-bar-track">
                <div className="soil-bar-fill" style={{ width: `${field.score}%`, background: field.color }} />
              </div>
            </div>
            <div className="soil-field-side">
              <strong>{field.score}%</strong>
              <span>{field.label}</span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
