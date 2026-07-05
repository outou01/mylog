import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  achieveVictoryCondition,
  DashboardHome,
  fetchDashboardHome,
  fetchVictoryCondition,
  HomeSeed,
  updateDashboardPurpose,
  VictoryCondition,
} from "../api/client";
import { completeSeed, plantSeed } from "../api/dreams";
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
  const [victory, setVictory] = useState<VictoryCondition | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState(false);
  const [purposeDraft, setPurposeDraft] = useState("");
  const [editingPurpose, setEditingPurpose] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadHome = async () => {
    const data = await fetchDashboardHome();
    setHome(data);
    setPurposeDraft(data.purpose.text);
    setError(false);
  };

  useEffect(() => {
    loadHome().catch(() => setError(true));
    fetchVictoryCondition().then(setVictory).catch(() => {});
  }, []);

  const savePurpose = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateDashboardPurpose(purposeDraft);
      await loadHome();
      setEditingPurpose(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAchieve = async () => {
    setSaving(true);
    try {
      const result = await achieveVictoryCondition();
      setVictory(result);
      setCelebrating(true);
    } finally {
      setSaving(false);
    }
  };

  const handlePlant = async (seed: HomeSeed) => {
    setSaving(true);
    try {
      await plantSeed(seed.id);
      await loadHome();
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (seed: HomeSeed) => {
    setSaving(true);
    try {
      await completeSeed(seed.id);
      await loadHome();
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="home-shell">
        <section className="home-card aria-panel">
          <div className="aria-avatar normal">
            <div className="aria-face">(＾ω＾)</div>
            <div className="aria-name">アリア</div>
          </div>
          <p className="aria-line">ご主人様、今日は30分だけ、自分の畑を耕しませんか？</p>
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

  const seed = home.current_seed;

  return (
    <div className="home-shell">
      {celebrating && victory && (
        <div className="victory-overlay" onClick={() => setCelebrating(false)}>
          <div className="victory-popup">
            <div className="victory-emoji">🎉</div>
            <div className="victory-headline">今日クリア！</div>
            <div className="victory-cond">「{victory.condition}」</div>
            <div className="victory-sub">アリア「さすがご主人様です！ (ﾉ´∀｀)ﾉ」 — タップで閉じる</div>
          </div>
        </div>
      )}

      <section className={`home-card aria-panel aria-${home.aria.mood}`}>
        <div className={`aria-avatar ${home.aria.mood}`}>
          <div className="aria-face">{home.aria.face}</div>
          <div className="aria-name">{home.aria.name}</div>
        </div>
        <p className="aria-line">{home.aria.message}</p>
      </section>

      {victory && (
        <section className={`home-card victory-card ${victory.achieved ? "achieved" : ""}`}>
          <div className="section-head">
            <p className="eyebrow">🎯 今日の勝利条件</p>
            {victory.achieved && <span className="victory-badge">クリア済み ✨</span>}
          </div>
          <p className="victory-text">「{victory.condition}」</p>
          {!victory.achieved && (
            <button className="console-button primary victory-achieve" onClick={handleAchieve} disabled={saving}>
              ✅ 達成した！
            </button>
          )}
        </section>
      )}

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
        <div className="section-head">
          <p className="eyebrow">🎯 総合目標</p>
          <button className="console-button" onClick={() => setEditingPurpose((v) => !v)}>
            {editingPurpose ? "閉じる" : "編集"}
          </button>
        </div>
        {editingPurpose ? (
          <form className="console-form" onSubmit={savePurpose}>
            <textarea value={purposeDraft} onChange={(event) => setPurposeDraft(event.target.value)} rows={4} />
            <div className="form-actions">
              <button className="console-button primary" disabled={saving}>保存</button>
            </div>
          </form>
        ) : (
          <div className="purpose-lines">
            {home.purpose.text.split("\n").map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
      </section>

      <section className="home-card continue-card">
        {seed ? (
          <>
            <div className="continue-top">
              <div>
                <p className="eyebrow">▶ 続きから</p>
                <h2>
                  {seed.dream_icon && <span className="seed-dream-icon">{seed.dream_icon}</span>}
                  {seed.title}
                </h2>
              </div>
              <span className="last-touched">最後: {seed.last_touched_label}</span>
            </div>

            <div className="continue-meta">
              {seed.dream_title && <span>🌌 {seed.dream_title}</span>}
              <span>{seed.category_label}</span>
              {seed.section && <span>{seed.section}</span>}
              <span>推定 {seed.estimated_minutes}分</span>
              {seed.planted_today && seed.today_time && <span className="planted-chip">🌱 今日 {seed.today_time}</span>}
            </div>

            {seed.purpose && (
              <div className="next-action-box">
                <span>なぜやるのか</span>
                <p>{seed.purpose}</p>
              </div>
            )}

            <div className="continue-actions seed-actions">
              {seed.planted_today ? (
                <button className="continue-button" onClick={() => handleComplete(seed)} disabled={saving}>
                  ✅ やった！（完了にする）
                </button>
              ) : (
                <button className="continue-button" onClick={() => handlePlant(seed)} disabled={saving}>
                  🌱 今日に植える（{seed.estimated_minutes}分）
                </button>
              )}
              <Link to="/calendar" className="console-button">予定を見る</Link>
              <Link to="/seeds" className="console-button">種リスト</Link>
            </div>
          </>
        ) : (
          <>
            <p className="eyebrow">▶ 続きから</p>
            <p className="support-text">植えられる種がありません。種リストで次の一手を用意しましょう。</p>
            <div className="continue-actions seed-actions">
              <Link to="/seeds" className="continue-button">種リストへ</Link>
            </div>
          </>
        )}
      </section>

      {home.seeds.length > 0 && (
        <section className="home-card project-switch-card">
          <p className="eyebrow">他の種</p>
          <div className="project-list">
            {home.seeds.map((item) => (
              <div className="project-row" key={item.id}>
                <div>
                  <strong>
                    {item.dream_icon && `${item.dream_icon} `}
                    {item.title}
                  </strong>
                  <span>{item.category_label}{item.section ? ` / ${item.section}` : ""} ・ {item.estimated_minutes}分</span>
                </div>
                <button className="console-button" disabled={saving || item.planted_today} onClick={() => handlePlant(item)}>
                  {item.planted_today ? "植え済み" : "植える"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="home-card life-card">
        <p className="eyebrow">人生ゲージ（今週の実測）</p>
        {home.life_gauge.has_data ? (
          <div className="life-gauges">
            <div className="life-gauge-row">
              <div className="gauge-label">
                <span>仕事 {formatMinutes(home.life_gauge.work_minutes)}</span>
                <strong>{home.life_gauge.work_percent}%</strong>
              </div>
              <ProgressBar value={home.life_gauge.work_percent} tone="work" />
            </div>
            <div className="life-gauge-row">
              <div className="gauge-label">
                <span>自分 {formatMinutes(home.life_gauge.self_minutes)}</span>
                <strong>{home.life_gauge.self_percent}%</strong>
              </div>
              <ProgressBar value={home.life_gauge.self_percent} tone="self" />
            </div>
          </div>
        ) : (
          <p className="support-text">今週の記録がまだありません。畑を耕すか、ログを書くとここに実測が出ます。</p>
        )}
      </section>

      <section className="home-card timeline-card">
        <p className="eyebrow">畑タイムライン</p>
        {home.timeline.length > 0 ? (
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
        ) : (
          <p className="support-text">完了した畑仕事がここに刻まれていきます。</p>
        )}
      </section>
    </div>
  );
}
