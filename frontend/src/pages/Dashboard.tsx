import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { DailyLog, fetchLatestLog, fetchVictoryCondition, updateLog, createLog } from "../api/client";
import Aria from "../components/Aria";
import "./Dashboard.css";

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const ENERGY_LABELS: Record<number, string> = { 1: "😩 疲れた", 2: "😐 普通", 3: "😊 元気" };
const DAY_TYPES = [
  { value: "advance", label: "⚔ 前進の日" },
  { value: "recovery", label: "🛌 回復の日" },
  { value: "maintenance", label: "🔧 メンテの日" },
];

type HourKey = "create_hours" | "workout_hours" | "study_hours" | "code_hours" | "job_search_hours";
const PROGRESS_ITEMS: { key: HourKey; label: string; icon: string }[] = [
  { key: "create_hours", label: "創作", icon: "🎨" },
  { key: "workout_hours", label: "筋トレ", icon: "💪" },
  { key: "code_hours", label: "開発", icon: "💻" },
  { key: "study_hours", label: "勉強", icon: "📚" },
  { key: "job_search_hours", label: "転職活動", icon: "💼" },
];

const HOUR_OPTIONS = [0, 0.5, 1, 1.5, 2, 3, 4];

const RECOVERY_ITEMS: [keyof DailyLog, string][] = [
  ["went_outside", "🌞 外出"],
  ["ate_good_food", "🍜 美食"],
  ["took_walk", "🚶 散歩"],
  ["visited_cafe", "☕ カフェ"],
  ["visited_akihabara", "🏙 秋葉原"],
  ["napped", "😴 昼寝"],
  ["played_games", "🎮 ゲーム"],
  ["talked_with_friends", "💬 友人と話す"],
  ["did_nothing", "☁ 何もしない"],
];

const PACHINKO_REASONS = ["ストレス", "暇", "秋葉原ついで", "動画を見て行きたくなった", "習慣", "その他"];
const FEELING_OPTIONS = [
  { value: "satisfied", label: "😊 スッキリ" },
  { value: "neutral", label: "😐 普通" },
  { value: "regret", label: "😞 後悔" },
];
const CREATION_MINUTES = [0, 10, 30, 60, 120];

function HourSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="hour-selector">
      {HOUR_OPTIONS.map((h) => (
        <button
          key={h}
          className={`hour-btn ${value === h ? "active" : ""} ${value > 0 && h === value ? "selected" : ""}`}
          onClick={() => onChange(h === value ? 0 : h)}
        >
          {h === 0 ? "—" : `${h}h`}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [log, setLog] = useState<DailyLog | null>(null);
  const [victory, setVictory] = useState<string | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  const [isToday, setIsToday] = useState(false);
  const [creatingLog, setCreatingLog] = useState(false);
  const [discharge, setDischarge] = useState("");
  const [showPachinko, setShowPachinko] = useState(false);

  const todayStr = localToday();

  const loadData = useCallback(async () => {
    try {
      const l = await fetchLatestLog();
      setLog(l);
      setIsToday(l.date === todayStr);
      setDischarge(l.discharge_activities ?? "");
      if (l.date === todayStr) {
        const v = await fetchVictoryCondition();
        setVictory(v.condition);
        if (l.victory_achieved) setCelebrated(true);
      }
    } catch {
      setLog(null);
    }
  }, [todayStr]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (discharge.includes("パチンコ")) setShowPachinko(true);
  }, [discharge]);

  const patch = async (fields: Partial<DailyLog>) => {
    if (!log) return;
    const updated = await updateLog(log.id, fields);
    setLog(updated);
  };

  const toggleRecovery = (key: keyof DailyLog) => {
    if (!log || !isToday) return;
    patch({ [key]: !log[key] });
  };

  const setHours = (key: HourKey, val: number) => {
    if (!log || !isToday) return;
    const boolKey = key === "create_hours" ? "did_create"
      : key === "workout_hours" ? "did_workout"
      : key === "code_hours" ? "did_code"
      : key === "study_hours" ? "did_study"
      : "did_job_search";
    patch({ [key]: val, [boolKey]: val > 0 });
  };

  const handleVictoryAchieved = async () => {
    await patch({ victory_achieved: true });
    setCelebrated(true);
  };

  const handleDischargeBlur = () => {
    if (!log || !isToday) return;
    patch({ discharge_activities: discharge });
  };

  const handleStartToday = async () => {
    setCreatingLog(true);
    try {
      const l = await createLog({ date: todayStr, sleep_hours: 7, mood_score: 3 });
      setLog(l);
      setIsToday(true);
      const v = await fetchVictoryCondition();
      setVictory(v.condition);
    } finally {
      setCreatingLog(false);
    }
  };

  const totalAdvanceHours = log
    ? (log.create_hours || 0) + (log.workout_hours || 0) + (log.study_hours || 0) + (log.code_hours || 0) + (log.job_search_hours || 0)
    : 0;
  const recoveryCount = log ? RECOVERY_ITEMS.filter(([k]) => log[k]).length : 0;

  if (!log) {
    return (
      <div className="dashboard">
        <div className="card empty-today">
          <div className="aria-wrap in">
            <div className="aria-avatar"><div className="aria-face">(＾ω＾)</div><div className="aria-name">アリア</div></div>
            <div className="aria-bubble"><p className="aria-text">ご主人様、今日もお会いできて嬉しいです！今日の記録を始めましょう。</p></div>
          </div>
          <button className="btn btn-primary start-btn" onClick={handleStartToday} disabled={creatingLog}>
            {creatingLog ? "準備中..." : "🌅 今日を始める"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {celebrated && (
        <div className="victory-overlay" onClick={() => setCelebrated(false)}>
          <div className="victory-popup">
            <div className="victory-emoji">🎉</div>
            <div className="victory-title">今日クリア！</div>
            <div className="victory-cond">「{victory}」</div>
            <div className="victory-sub">タップで閉じる</div>
          </div>
        </div>
      )}

      <div className="dashboard-new">

        {/* アリア */}
        <div className="card aria-card">
          <Aria />
        </div>

        {/* 勝利条件 */}
        {isToday && victory && (
          <div className={`card victory-card ${log.victory_achieved ? "achieved" : ""}`}>
            <div className="victory-label">🎯 今日の勝利条件</div>
            <div className="victory-text">「{victory}」</div>
            {!log.victory_achieved ? (
              <button className="btn btn-accent victory-btn" onClick={handleVictoryAchieved}>✅ 達成した！</button>
            ) : (
              <div className="victory-done">✨ クリア済み</div>
            )}
          </div>
        )}

        {/* エネルギー & 日タイプ */}
        {isToday && (
          <div className="card energy-card">
            <div className="section-label">今日のエネルギー</div>
            <div className="energy-slider">
              {[1, 2, 3].map((v) => (
                <button key={v} className={`energy-btn ${log.energy_level === v ? "active" : ""}`}
                  onClick={() => patch({ energy_level: v })}>
                  {ENERGY_LABELS[v]}
                </button>
              ))}
            </div>
            <div className="section-label" style={{ marginTop: "1rem" }}>今日の目的</div>
            <div className="day-type-selector">
              {DAY_TYPES.map(({ value, label }) => (
                <button key={value} className={`day-type-btn ${log.day_type === value ? "active" : ""}`}
                  onClick={() => patch({ day_type: value })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 前進クエスト（時間入力） */}
        <div className="card quest-card">
          <div className="section-label">
            ⚔ 前進クエスト
            {totalAdvanceHours > 0 && <span className="total-hours-badge">合計 {totalAdvanceHours}h</span>}
          </div>
          <div className="quest-list">
            {PROGRESS_ITEMS.map(({ key, label, icon }) => {
              const val = (log[key] as number) || 0;
              return (
                <div key={key} className={`quest-item ${val > 0 ? "active" : ""}`}>
                  <div className="quest-item-header">
                    <span className="quest-icon">{icon}</span>
                    <span className="quest-label">{label}</span>
                    {val > 0 && <span className="quest-hours">{val}h</span>}
                  </div>
                  {isToday && <HourSelector value={val} onChange={(v) => setHours(key, v)} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* 回復クエスト */}
        <div className="card checklist-card recovery">
          <div className="section-label">
            🛌 回復クエスト <span className="count-badge">{recoveryCount}/{RECOVERY_ITEMS.length}</span>
          </div>
          <div className="checklist">
            {RECOVERY_ITEMS.map(([key, label]) => (
              <label key={key}
                className={`check-item ${log[key] ? "checked" : ""} ${!isToday ? "readonly" : ""}`}
                onClick={() => toggleRecovery(key)}>
                <span className="check-box">{log[key] ? "✅" : "⬜"}</span>
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 発散ログ */}
        {isToday && (
          <div className="card discharge-card">
            <div className="section-label">💨 発散ログ（記録のみ・否定なし）</div>
            <textarea className="discharge-input"
              placeholder="ゲーム、YouTube、パチンコ、映画... なんでもOK"
              value={discharge}
              onChange={(e) => setDischarge(e.target.value)}
              onBlur={handleDischargeBlur}
              rows={2}
            />
          </div>
        )}

        {/* パチンコ分析 */}
        {isToday && showPachinko && (
          <div className="card pachinko-card">
            <div className="section-label">🎰 パチンコ分析（学習用）</div>
            <div className="pachinko-section">
              <div className="pachinko-label">今日行った理由</div>
              <div className="pachinko-reasons">
                {PACHINKO_REASONS.map((r) => {
                  const selected = log.pachinko_reason?.includes(r);
                  return (
                    <button key={r}
                      className={`pachinko-tag ${selected ? "active" : ""}`}
                      onClick={() => {
                        const current = log.pachinko_reason || "";
                        const next = selected
                          ? current.replace(r, "").replace(/、、/g, "、").replace(/^、|、$/g, "")
                          : current ? `${current}、${r}` : r;
                        patch({ pachinko_reason: next });
                      }}>
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="pachinko-section">
              <div className="pachinko-label">終了後の気分</div>
              <div className="feeling-selector">
                {FEELING_OPTIONS.map(({ value, label }) => (
                  <button key={value}
                    className={`feeling-btn ${log.pachinko_feeling_after === value ? "active" : ""}`}
                    onClick={() => patch({ pachinko_feeling_after: value })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="pachinko-section">
              <div className="pachinko-label">その後、何分前進できた？</div>
              <div className="minutes-selector">
                {CREATION_MINUTES.map((m) => (
                  <button key={m}
                    className={`minutes-btn ${log.pachinko_creation_minutes_after === m ? "active" : ""}`}
                    onClick={() => patch({ pachinko_creation_minutes_after: m })}>
                    {m === 0 ? "0分" : `${m}分`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 睡眠・気分サマリー */}
        <div className="card summary-card">
          <div className="summary-row">
            <span className="summary-item">😴 睡眠 <strong>{log.sleep_hours}h</strong></span>
            <span className="summary-item">気分 <strong>{["", "😞", "😕", "😐", "🙂", "😄"][log.mood_score]}</strong></span>
            <span className="summary-item">残業 <strong>{log.overtime_hours}h</strong></span>
          </div>
        </div>

        <div className="dashboard-actions">
          <Link to={`/log/edit/${log.id}`} className="btn btn-primary">詳細を編集</Link>
          <Link to="/calendar" className="btn btn-accent">カレンダー</Link>
        </div>

      </div>
    </div>
  );
}
