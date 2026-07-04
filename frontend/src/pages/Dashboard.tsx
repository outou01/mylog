import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  activateDashboardProject,
  createDashboardProject,
  DashboardHome,
  DashboardProjectPayload,
  fetchDashboardHome,
  updateDashboardProject,
  updateDashboardPurpose,
} from "../api/client";
import "./Dashboard.css";

type ProjectForm = DashboardProjectPayload;

const emptyProject: ProjectForm = {
  title: "",
  reason: "",
  next_action: "",
  estimated_minutes: 30,
  memo: "",
  status: "active",
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

function toProjectForm(project: DashboardHome["current_project"]): ProjectForm {
  return {
    title: project.title,
    reason: project.reason,
    next_action: project.next_action,
    estimated_minutes: project.estimated_minutes,
    memo: project.memo ?? "",
    status: project.status,
  };
}

export default function Dashboard() {
  const [home, setHome] = useState<DashboardHome | null>(null);
  const [error, setError] = useState(false);
  const [purposeDraft, setPurposeDraft] = useState("");
  const [editingPurpose, setEditingPurpose] = useState(false);
  const [projectDraft, setProjectDraft] = useState<ProjectForm>(emptyProject);
  const [editingProject, setEditingProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadHome = async () => {
    const data = await fetchDashboardHome();
    setHome(data);
    setPurposeDraft(data.purpose.text);
    setProjectDraft(toProjectForm(data.current_project));
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

  const saveProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!home) return;
    setSaving(true);
    try {
      const payload = { ...projectDraft, memo: projectDraft.memo || null };
      if (creatingProject) {
        await createDashboardProject(payload);
      } else {
        await updateDashboardProject(home.current_project.id, payload);
      }
      await loadHome();
      setEditingProject(false);
      setCreatingProject(false);
    } finally {
      setSaving(false);
    }
  };

  const activateProject = async (id: number) => {
    setSaving(true);
    try {
      await activateDashboardProject(id);
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
      <section className={`home-card aria-panel aria-${home.aria.mood}`}>
        <div className={`aria-avatar ${home.aria.mood}`}>
          <div className="aria-face">{home.aria.face}</div>
          <div className="aria-name">{home.aria.name}</div>
        </div>
        <p className="aria-line">{home.aria.message}</p>
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

        <div className="continue-actions">
          <Link to="/log" className="continue-button">続きから</Link>
          <button className="console-button" onClick={() => {
            setCreatingProject(false);
            setProjectDraft(toProjectForm(home.current_project));
            setEditingProject((v) => !v);
          }}>
            タスク編集
          </button>
          <button className="console-button" onClick={() => {
            setCreatingProject(true);
            setProjectDraft(emptyProject);
            setEditingProject(true);
          }}>
            新規登録
          </button>
        </div>

        {editingProject && (
          <form className="console-form project-editor" onSubmit={saveProject}>
            <label>
              タスク名
              <input value={projectDraft.title} onChange={(event) => setProjectDraft({ ...projectDraft, title: event.target.value })} />
            </label>
            <label>
              なぜやるのか
              <textarea value={projectDraft.reason} onChange={(event) => setProjectDraft({ ...projectDraft, reason: event.target.value })} rows={2} />
            </label>
            <label>
              次にやること
              <textarea value={projectDraft.next_action} onChange={(event) => setProjectDraft({ ...projectDraft, next_action: event.target.value })} rows={2} />
            </label>
            <div className="form-grid">
              <label>
                推定分
                <input type="number" min="1" max="1440" value={projectDraft.estimated_minutes} onChange={(event) => setProjectDraft({ ...projectDraft, estimated_minutes: Number(event.target.value) })} />
              </label>
              <label>
                状態
                <select value={projectDraft.status} onChange={(event) => setProjectDraft({ ...projectDraft, status: event.target.value })}>
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                  <option value="done">done</option>
                </select>
              </label>
            </div>
            <label>
              メモ
              <textarea value={projectDraft.memo ?? ""} onChange={(event) => setProjectDraft({ ...projectDraft, memo: event.target.value })} rows={2} />
            </label>
            <div className="form-actions">
              <button className="console-button primary" disabled={saving}>{creatingProject ? "登録" : "保存"}</button>
              <button type="button" className="console-button" onClick={() => setEditingProject(false)}>キャンセル</button>
            </div>
          </form>
        )}
      </section>

      <section className="home-card project-switch-card">
        <p className="eyebrow">タスク切替</p>
        <div className="project-list">
          {home.projects.map((project) => (
            <div className={`project-row ${project.status === "active" ? "active" : ""}`} key={project.id}>
              <div>
                <strong>{project.title}</strong>
                <span>{project.next_action}</span>
              </div>
              <button className="console-button" disabled={saving || project.status === "active"} onClick={() => activateProject(project.id)}>
                {project.status === "active" ? "使用中" : "使う"}
              </button>
            </div>
          ))}
        </div>
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
