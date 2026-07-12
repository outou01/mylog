import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchProjectDetail, plantSeed, ProjectDetail } from "../api/dreams";
import { scheduleCategoryLabel } from "../constants/categories";
import "./Dreams.css";

export default function DreamDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [plantingId, setPlantingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    fetchProjectDetail(Number(id)).then(setDetail);
  }, [id]);

  const plant = async (seedId: number) => {
    setPlantingId(seedId);
    try {
      const planted = await plantSeed(seedId);
      setMessage(`${planted.start_time}-${planted.end_time} にカレンダーへ植えました。`);
    } finally {
      setPlantingId(null);
    }
  };

  if (!detail) return <div className="dream-muted">読み込み中...</div>;

  return (
    <div className="dream-detail-page">
      <section className={`project-hero ${detail.dream.category}`}>
        <div className="project-icon">{detail.dream.icon || "🌱"}</div>
        <div>
          <p>{scheduleCategoryLabel(detail.dream.category)}</p>
          <h1>{detail.dream.title}</h1>
          <span>{detail.dream.description}</span>
        </div>
      </section>

      <section className="project-layout">
        <article className="project-card">
          <p>現在地</p>
          <h2>{detail.project.title}</h2>
          <span>{detail.project.current_position || "現在地を追加できます。"}</span>
        </article>

        <article className="project-card">
          <p>ステップ</p>
          <ol className="project-steps">
            {detail.project.steps.map((step, index) => (
              <li key={`${step}-${index}`}>
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="project-card">
        <div className="project-section-head">
          <div>
            <p>種リスト</p>
            <h2>この夢に紐づく今日の一手</h2>
          </div>
          <Link to="/seeds">すべての種を見る</Link>
        </div>
        {message && <div className="plant-message">{message}</div>}
        <div className="seed-mini-list">
          {detail.seeds.map((seed) => (
            <div className="seed-mini-card" key={seed.id}>
              <div>
                <span>{seed.section || "未分類"}</span>
                <strong>{seed.title}</strong>
                <p>{seed.purpose || seed.description || "目的を追加できます。"}</p>
              </div>
              <button type="button" onClick={() => plant(seed.id)} disabled={plantingId === seed.id}>
                {plantingId === seed.id ? "植えています..." : `今日植える ${seed.estimated_minutes}分`}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
