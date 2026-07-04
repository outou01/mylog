import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardHome, fetchDashboardHome } from "../api/client";
import "./Dashboard.css";

function ProgressBar({ value, tone = "field" }: { value: number; tone?: "field" | "work" | "self" }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className={`meter meter-${tone}`} aria-label={`${safeValue}%`}>
      <div className="meter-fill" style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

export default function Dashboard() {
  const [home, setHome] = useState<DashboardHome | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchDashboardHome()
      .then((data) => {
        setHome(data);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="home-shell">
        <section className="home-card aria-panel">
          <p className="eyebrow">アリア</p>
          <p className="aria-line">今日は30分だけ、自分の畑を耕しましょう。</p>
        </section>
      </div>
    );
  }

  if (!home) {
    return (
      <div className="home-shell">
        <section className="home-card loading-panel">
          <p className="eyebrow">読み込み中</p>
          <div className="loading-line" />
          <div className="loading-line short" />
        </section>
      </div>
    );
  }

  return (
    <div className="home-shell">
      <section className="home-card aria-panel">
        <div className="aria-mark">Aria</div>
        <p className="aria-line">{home.aria_message}</p>
      </section>

      <section className="home-card field-card">
        <div className="card-heading">
          <span className="card-icon">🌱</span>
          <div>
            <p className="eyebrow">自分の畑</p>
            <h1>{formatMinutes(home.field.weekly_minutes)}</h1>
          </div>
        </div>
        <div className="progress-row">
          <ProgressBar value={home.field.progress_percent} />
          <span>{home.field.progress_percent}%</span>
        </div>
        <p className="support-text">{home.field.message}</p>
      </section>

      <section className="home-card purpose-card">
        <p className="eyebrow">🎯 今の目的</p>
        <div className="purpose-lines">
          {home.purpose.text.split("\n").map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>

      <section className="home-card continue-card">
        <div className="continue-top">
          <div>
            <p className="eyebrow">▶ 続きから</p>
            <h2>{home.current_project.title}</h2>
          </div>
          <span className="last-touched">最後: {home.current_project.last_touched_label}</span>
        </div>

        <div className="next-action-box">
          <span>次にやること</span>
          <p>{home.current_project.next_action}</p>
        </div>

        <div className="continue-meta">
          <span>推定: {home.current_project.estimated_minutes}分</span>
          <span>{home.current_project.reason}</span>
        </div>

        {home.current_project.memo && <p className="project-memo">{home.current_project.memo}</p>}

        <Link to="/log" className="continue-button">続きから</Link>
      </section>

      <section className="home-card life-card">
        <p className="eyebrow">人生ゲージ</p>
        <div className="life-gauges">
          <div className="life-gauge-row">
            <div className="gauge-label">
              <span>仕事</span>
              <strong>{home.life_gauge.work_percent}%</strong>
            </div>
            <ProgressBar value={home.life_gauge.work_percent} tone="work" />
          </div>
          <div className="life-gauge-row">
            <div className="gauge-label">
              <span>自分</span>
              <strong>{home.life_gauge.self_percent}%</strong>
            </div>
            <ProgressBar value={home.life_gauge.self_percent} tone="self" />
          </div>
        </div>
      </section>

      <section className="home-card timeline-card">
        <p className="eyebrow">畑タイムライン</p>
        <ol className="timeline-list">
          {home.timeline.map((item) => (
            <li key={`${item.date_label}-${item.title}`}>
              <time>{item.date_label}</time>
              <div>
                <strong>{item.title}</strong>
                {item.note && <p>{item.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
