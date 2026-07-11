import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchFocusHome,
  FocusHabit,
  FocusHome,
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

function fieldLabel(score: number) {
  if (score >= 80) return "よく育っている";
  if (score >= 60) return "安定している";
  if (score >= 40) return "芽が伸びている";
  if (score >= 20) return "芽が出ている";
  return "これから育つ";
}

export default function Dashboard() {
  const [home, setHome] = useState<FocusHome | null>(null);
  const [selectedHabit, setSelectedHabit] = useState<FocusHabit | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

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

  return (
    <main className="focus-home">
      <section className="focus-action" style={{ "--action-color": home.action.key === "creation" ? "#a970d6" : "#79b780" } as React.CSSProperties}>
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
          <Link className="focus-primary" to="/calendar">時間を決める</Link>
        )}
      </section>

      <section className="daily-shape">
        <header>
          <div>
            <p className="focus-kicker">今日の型</p>
            <h2>全部ではなく、今日の分だけ</h2>
          </div>
          <span>○ 今日　✓ 完了　― 対象外</span>
        </header>
        <div className="habit-line">
          {home.habits.map((habit) => (
            <button
              type="button"
              className={`habit-item ${habit.status} ${selectedHabit?.key === habit.key ? "selected" : ""}`}
              key={habit.key}
              onClick={() => setSelectedHabit(selectedHabit?.key === habit.key ? null : habit)}
            >
              <span>{habit.icon}</span>
              <strong>{habit.label}</strong>
              <em>{STATUS_MARK[habit.status] ?? "○"}</em>
            </button>
          ))}
        </div>
        {selectedHabit && (
          <div className="habit-detail">
            <div>
              <strong>{selectedHabit.icon} {selectedHabit.label}</strong>
              <span>標準 {selectedHabit.standard_minutes}分 ・ 最低 {selectedHabit.minimum_minutes}分 ・ {selectedHabit.cue}</span>
            </div>
            {selectedHabit.status !== "off" && (
              <div>
                <button type="button" onClick={() => recordHabit(selectedHabit, selectedHabit.minimum_minutes)} disabled={saving}>最低ライン</button>
                <button type="button" onClick={() => recordHabit(selectedHabit, selectedHabit.standard_minutes)} disabled={saving}>完了</button>
              </div>
            )}
          </div>
        )}
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
            </div>
          ))}
        </div>
      </section>

      <section className="daily-principle">
        <span>{home.principle.icon}</span>
        <div>
          <p className="focus-kicker">今日の原則</p>
          <h2>{home.principle.title}</h2>
          <p>{home.principle.text}</p>
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
