import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  DashboardHome,
  fetchDashboardHome,
  HomeSeed,
  updateDashboardPurpose,
} from "../api/client";
import { completeSeed, plantSeed } from "../api/dreams";
import "./Dashboard.css";

const LEVEL_ICON: Record<number, string> = {
  1: "🟫", 2: "🌱", 3: "🌿", 4: "🍀", 5: "🌾", 6: "🏞️",
};

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

function Foldable({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`home-card foldable ${open ? "open" : ""}`}>
      <button type="button" className="foldable-head" onClick={() => setOpen((v) => !v)}>
        <p className="eyebrow">{title}</p>
        <span className="foldable-arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="foldable-body">{children}</div>}
    </section>
  );
}

export default function Dashboard() {
  const [home, setHome] = useState<DashboardHome | null>(null);
  const [error, setError] = useState(false);
  const [celebrating, setCelebrating] = useState<string | null>(null);
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
      setCelebrating(seed.title);
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
  const field = home.field;

  return (
    <div className="home-shell home-shell-focus">
      {celebrating && (
        <div className="victory-overlay" onClick={() => setCelebrating(null)}>
          <div className="victory-popup">
            <div className="victory-emoji">🎉</div>
            <div className="victory-headline">今日クリア！</div>
            <div className="victory-cond">「{celebrating}」</div>
            <div className="victory-sub">アリア「さすがご主人様です！ (ﾉ´∀｀)ﾉ」 — タップで閉じる</div>
          </div>
        </div>
      )}

      {/* ── 主役: アリアが今日のクエストを手渡す ── */}
      <section className="home-card quest-hero">
        <div className={`quest-aria aria-${home.aria.mood}`}>
          <div className={`aria-avatar ${home.aria.mood}`}>
            <div className="aria-face">{home.aria.face}</div>
            <div className="aria-name">{home.aria.name}</div>
          </div>
          <p className="aria-line">{home.aria.message}</p>
        </div>

        {seed ? (
          <div className="quest-body">
            <p className="eyebrow">🎯 今日のクエスト</p>
            <h1 className="quest-title">
              {seed.dream_icon && <span className="seed-dream-icon">{seed.dream_icon}</span>}
              {seed.title}
            </h1>
            <div className="continue-meta">
              {seed.dream_title && <span>🌌 {seed.dream_title}</span>}
              <span>{seed.category_label}</span>
              {seed.section && <span>{seed.section}</span>}
              <span>推定 {seed.estimated_minutes}分</span>
              <span>最後: {seed.last_touched_label}</span>
              {seed.planted_today && seed.today_time && <span className="planted-chip">🌱 今日 {seed.today_time}</span>}
            </div>
            {seed.purpose && <p className="quest-purpose">{seed.purpose}</p>}
            <div className="quest-actions">
              {!seed.planted_today && (
                <button className="continue-button" onClick={() => handlePlant(seed)} disabled={saving}>
                  🌱 今日に植える（{seed.estimated_minutes}分）
                </button>
              )}
              <button
                className={seed.planted_today ? "continue-button" : "console-button quest-done-sub"}
                onClick={() => handleComplete(seed)}
                disabled={saving}
              >
                ✅ 達成した！
              </button>
            </div>
          </div>
        ) : (
          <div className="quest-body">
            <p className="eyebrow">🎯 今日のクエスト</p>
            <p className="support-text">植えられる種がありません。種リストで次の一手を用意しましょう。</p>
            <div className="quest-actions">
              <Link to="/seeds" className="continue-button">種リストへ</Link>
            </div>
          </div>
        )}
      </section>

      {/* ── 畑の様子: 累計は絶対に減らない ── */}
      <section className="home-card field-status">
        <div className="field-status-row">
          <div className="field-status-item">
            <span className="field-status-icon">{LEVEL_ICON[field.level] ?? "🌱"}</span>
            <div>
              <strong>Lv.{field.level} {field.level_title}</strong>
              <span>累計 {formatMinutes(field.total_minutes)}</span>
            </div>
          </div>
          <div className="field-status-item">
            <span className="field-status-icon">🔥</span>
            <div>
              <strong>{field.streak_days}日連続</strong>
              <span>畑仕事</span>
            </div>
          </div>
          <div className="field-status-item">
            <span className="field-status-icon">⏱</span>
            <div>
              <strong>{formatMinutes(field.weekly_minutes)}</strong>
              <span>今週</span>
            </div>
          </div>
        </div>
        {field.next_title && field.next_remaining_minutes != null && (
          <div className="field-next">
            <ProgressBar
              value={100 - (field.next_remaining_minutes / Math.max(1, field.next_remaining_minutes + field.total_minutes)) * 100}
            />
            <span>「{field.next_title}」まであと{formatMinutes(field.next_remaining_minutes)}</span>
          </div>
        )}
        <p className="support-text">{field.message}</p>
      </section>

      {/* ── 折りたたみ: 見たい時だけ ── */}
      <Foldable title="🎯 総合目標">
        <div className="section-head">
          <span />
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
      </Foldable>

      {home.seeds.length > 0 && (
        <Foldable title="🌰 他の種">
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
          <div className="form-actions" style={{ marginTop: "0.8rem" }}>
            <Link to="/seeds" className="console-button">種リストへ</Link>
          </div>
        </Foldable>
      )}

      <Foldable title="⚖ 人生ゲージ（今週の実測）">
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
      </Foldable>

      <Foldable title="🌾 畑タイムライン">
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
      </Foldable>
    </div>
  );
}
