import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchFocusHome,
  FocusHabit,
  FocusHome,
  updateCreationResumeNote,
  updateFocusHabit,
} from "../api/client";
import { plantSeed } from "../api/dreams";
import Calendar from "./Calendar";
import "./Dashboard.css";

const STATUS_MARK: Record<string, string> = {
  done: "✓",
  minimum: "🌱",
  today: "○",
  off: "―",
};

const HABIT_COPY: Record<string, { label: string; choices: { label: string; minutes: number }[] }> = {
  meditation: {
    label: "心を整える",
    choices: [
      { label: "1分呼吸する", minutes: 1 },
      { label: "5分整える", minutes: 5 },
      { label: "10分座る", minutes: 10 },
    ],
  },
  reading: {
    label: "知識に触れる",
    choices: [
      { label: "2ページ読む", minutes: 2 },
      { label: "10分読む", minutes: 10 },
      { label: "30分読む", minutes: 30 },
    ],
  },
  creation: {
    label: "創作に触れる",
    choices: [
      { label: "5分だけ触れる", minutes: 5 },
      { label: "15分進める", minutes: 15 },
      { label: "集中してやる", minutes: 30 },
    ],
  },
};

const STATUS_LABEL: Record<string, string> = {
  done: "接続済み",
  minimum: "つながった",
  today: "今日つなぐ",
  off: "休息日",
};

function fieldLabel(score: number) {
  if (score >= 80) return "よく育っている";
  if (score >= 60) return "安定している";
  if (score >= 40) return "芽が伸びている";
  if (score >= 20) return "芽が出ている";
  return "これから育つ";
}

function displayHabitStatus(habit: FocusHabit) {
  if (habit.key === "creation" && (habit.status === "minimum" || habit.status === "done")) return "done";
  return habit.status;
}

function actionPillar(key: string) {
  if (key === "creation") return { label: "作り切る", anchor: "complete" };
  if (key === "social") return { label: "届ける", anchor: "deliver" };
  if (["reading", "job_search"].includes(key)) return { label: "磨き続ける", anchor: "sharpen" };
  return null;
}

export default function Dashboard() {
  const [home, setHome] = useState<FocusHome | null>(null);
  const [selectedHabit, setSelectedHabit] = useState<FocusHabit | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [pendingCreation, setPendingCreation] = useState<{ label: string; minutes: number } | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeDraft, setResumeDraft] = useState("");

  const load = async () => {
    const data = await fetchFocusHome();
    setHome(data);
    setError(false);
  };

  useEffect(() => {
    load().catch(() => setError(true));
  }, []);

  const recordHabit = async (habit: FocusHabit, minutes: number) => {
    setSaving(true);
    try {
      await updateFocusHabit(habit.key, minutes);
      setSelectedHabit(null);
      setActionOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const startSeed = async () => {
    if (!home?.action.seed_id) return;
    setSaving(true);
    try {
      await plantSeed(home.action.seed_id);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const completeCreation = async () => {
    if (!pendingCreation) return;
    setSaving(true);
    try {
      await updateFocusHabit("creation", pendingCreation.minutes);
      await load();
      setPendingCreation(null);
      setShowResumePrompt(true);
    } finally {
      setSaving(false);
    }
  };

  const saveResumeNote = async () => {
    if (!resumeDraft.trim()) return;
    setSaving(true);
    try {
      await updateCreationResumeNote(resumeDraft.trim());
      await load();
      setResumeDraft("");
      setShowResumePrompt(false);
      setSelectedHabit(null);
    } finally {
      setSaving(false);
    }
  };

  const closeCreationFlow = () => {
    setPendingCreation(null);
    setShowResumePrompt(false);
    setResumeDraft("");
    setSelectedHabit(null);
  };

  if (error) {
    return (
      <main className="focus-home focus-empty">
        <span>🌱</span>
        <h1>今日は小さな一手だけで十分です</h1>
        <p>ホームを読み込めませんでした。畑は逃げないので、少し時間を置いてください。</p>
      </main>
    );
  }

  if (!home) {
    return <main className="focus-home focus-loading">今日の一手を選んでいます...</main>;
  }

  const actionHabit = home.habits.find((habit) => habit.key === home.action.key);
  const selectedCopy = selectedHabit ? HABIT_COPY[selectedHabit.key] : null;
  const pillar = actionPillar(home.action.key);

  return (
    <main className="focus-home">
      <section className={`focus-action ${home.action.title.length > 24 ? "long-title" : ""}`} style={{ "--action-color": home.action.key === "creation" ? "#a970d6" : "#79b780" } as React.CSSProperties}>
        <div className="focus-action-copy">
          <p className="focus-kicker">今日の一手</p>
          <div className="focus-action-title">
            <span>{home.action.icon}</span>
            <h1>{home.action.title}</h1>
          </div>
          <p className="focus-reason">{home.action.reason}</p>
          {home.action.minimum_minutes > 0 && (
            <p className="focus-minimum">最低ライン：{home.action.minimum_label}</p>
          )}
          {pillar && <Link className="focus-pillar-link" to={`/blueprint#pillar-${pillar.anchor}`}>つながる柱：{pillar.label} →</Link>}
        </div>

        {home.action.kind === "habit" && actionHabit && (
          <div className="focus-action-control">
            {!actionOpen ? (
              <button type="button" className="focus-primary" onClick={() => setActionOpen(true)}>始める</button>
            ) : (
              <div className="focus-complete-choices">
                <span>できた量を選ぶ</span>
                <button type="button" onClick={() => recordHabit(actionHabit, home.action.minimum_minutes)} disabled={saving}>
                  最低 {home.action.minimum_minutes}分
                </button>
                <button type="button" className="primary" onClick={() => recordHabit(actionHabit, home.action.standard_minutes)} disabled={saving}>
                  標準 {home.action.standard_minutes}分
                </button>
              </div>
            )}
          </div>
        )}
        {home.action.kind === "seed" && (
          <button type="button" className="focus-primary" onClick={startSeed} disabled={saving}>今日に植える</button>
        )}
        {home.action.kind === "calendar" && (
          <Link className="focus-primary" to="/calendar">今週の予定に入れる</Link>
        )}
      </section>

      <section className="daily-shape">
        <header>
          <div>
            <p className="focus-kicker">今日の型</p>
            <h2>全部ではなく、今日の分だけ</h2>
          </div>
          <span>○ 今日つなぐ　✓ 接続済み　― 休息日</span>
        </header>
        <div className="habit-line">
          {home.habits.map((habit) => (
            (() => {
              const displayStatus = displayHabitStatus(habit);
              return (
            <button
              type="button"
              className={`habit-item ${displayStatus} ${selectedHabit?.key === habit.key ? "selected" : ""}`}
              key={habit.key}
              onClick={() => {
                const closing = selectedHabit?.key === habit.key;
                setSelectedHabit(closing ? null : habit);
                setPendingCreation(null);
                setShowResumePrompt(false);
                setResumeDraft("");
              }}
            >
              <span>{habit.icon}</span>
              <span className="habit-copy">
                <strong>{HABIT_COPY[habit.key]?.label ?? habit.label}</strong>
                {habit.key === "creation" && <small>原稿を5分だけ開く</small>}
              </span>
              <em><b>{STATUS_MARK[displayStatus] ?? "○"}</b>{STATUS_LABEL[displayStatus]}</em>
            </button>
              );
            })()
          ))}
        </div>
        {selectedHabit && (
          <div className="habit-detail">
            <div className="habit-detail-copy">
              <strong>{selectedHabit.icon} {selectedCopy?.label ?? selectedHabit.label}</strong>
              <span>少し触れるだけでも、明日の再開が軽くなります。</span>
              {selectedHabit.key === "creation" && home.creation_resume_note && !showResumePrompt && (
                <blockquote>
                  <small>前回の続き</small>
                  {home.creation_resume_note}
                </blockquote>
              )}
            </div>
            {selectedHabit.key === "creation" && showResumePrompt ? (
              <div className="resume-note-form">
                <label htmlFor="creation-resume-note">次はどこから始める？</label>
                <input
                  id="creation-resume-note"
                  value={resumeDraft}
                  onChange={(event) => setResumeDraft(event.target.value)}
                  placeholder="例：エレノアが雷を放つ直前から書く"
                  maxLength={500}
                  autoFocus
                />
                <div>
                  <button type="button" onClick={closeCreationFlow}>スキップ</button>
                  <button type="button" className="primary" onClick={saveResumeNote} disabled={saving || !resumeDraft.trim()}>保存する</button>
                </div>
              </div>
            ) : selectedHabit.key === "creation" && pendingCreation ? (
              <div className="creation-complete">
                <span>{pendingCreation.label}</span>
                <button type="button" className="primary" onClick={completeCreation} disabled={saving}>完了する</button>
              </div>
            ) : (selectedHabit.key === "creation" || selectedHabit.status !== "off") && (
              <div className="connection-choices">
                {(selectedCopy?.choices ?? []).map((choice) => (
                  <button
                    type="button"
                    key={choice.label}
                    onClick={() => selectedHabit.key === "creation" ? setPendingCreation(choice) : recordHabit(selectedHabit, choice.minutes)}
                    disabled={saving}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="home-rhythm" aria-label="自動運転">
        {home.primary_project && (
          <div className="home-primary-project">
            <span>本命プロジェクト</span>
            <strong>{home.primary_project.title}</strong>
            <em>{home.primary_project.progress}%</em>
          </div>
        )}
        <div className="home-fixed-schedule">
          <span>次の固定予定</span>
          {home.fixed_schedules.map((item) => (
            <div key={item.key} className={item.status}>
              <strong>{item.date_label}</strong>
              <span>{item.title}</span>
            </div>
          ))}
        </div>
        <details className="home-maintenance">
          <summary>
            <span>今週のメンテナンス</span>
            <strong>{home.maintenance.filter((item) => item.status === "done").length}/{home.maintenance.length}</strong>
          </summary>
          <div>
            {home.maintenance.map((item) => (
              <p key={item.key} className={item.status}>
                <span>{item.title}</span><em>{item.status_label}</em>
              </p>
            ))}
          </div>
        </details>
      </section>

      <section className="home-field">
        <header>
          <p className="focus-kicker">今週の畑</p>
          <Link to="/calendar">詳しく見る →</Link>
        </header>
        <div className="home-field-list">
          {home.fields.map((field) => (
            <div className="home-field-row" key={field.key}>
              <span className="home-field-name">{field.icon} {field.name}</span>
              <div className="home-field-track">
                <div style={{ width: `${field.score}%`, background: field.color }} />
              </div>
              <strong>{field.score}</strong>
              <small>{fieldLabel(field.score)}</small>
              <span className={`connection-state ${field.connection_tone}`}>{field.connection_label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="daily-principle">
        <span>{home.principle.icon}</span>
        <div>
          <p className="focus-kicker">今日の原則</p>
          <h2>{home.principle.title}</h2>
          <details>
            <summary>続きを読む</summary>
            <p>{home.principle.text}</p>
          </details>
          <Link className="principle-blueprint-link" to="/blueprint#principles">設計図で見る →</Link>
        </div>
      </section>

      <section className="home-calendar">
        <header>
          <div>
            <p className="focus-kicker">今週の予定</p>
            <h2>時刻に意味があるものだけ</h2>
          </div>
          <Link to="/calendar">カレンダーを開く →</Link>
        </header>
        <Calendar embedded />
      </section>
    </main>
  );
}
