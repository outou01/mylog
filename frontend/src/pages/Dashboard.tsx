import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  DailyLog, fetchLatestLog, fetchVictoryCondition, updateLog, createLog,
} from "../api/client";
import Aria from "../components/Aria";
import "./Dashboard.css";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const ENERGY_LABELS: Record<number, string> = { 1: "😩 疲れた", 2: "😐 普通", 3: "😊 元気" };
const DAY_TYPES = [
  { value: "advance", label: "⚔ 前進の日" },
  { value: "recovery", label: "🛌 回復の日" },
  { value: "maintenance", label: "🔧 メンテの日" },
];

const PROGRESS_ITEMS: [keyof DailyLog, string][] = [
  ["did_workout", "💪 筋トレ"],
  ["did_create", "🎨 創作"],
  ["did_code", "💻 開発"],
  ["did_job_search", "💼 転職活動"],
  ["did_study", "📚 勉強"],
];

const RECOVERY_ITEMS: [keyof DailyLog, string][] = [
  ["went_outside", "🌞 外出した"],
  ["ate_good_food", "🍜 美味しいもの食べた"],
  ["took_walk", "🚶 散歩した"],
  ["visited_cafe", "☕ カフェ行った"],
  ["visited_akihabara", "🏙 秋葉原行った"],
  ["napped", "😴 昼寝した"],
  ["played_games", "🎮 ゲームした"],
  ["talked_with_friends", "💬 友人と話した"],
  ["did_nothing", "☁ 何もしなかった"],
];

export default function Dashboard() {
  const [log, setLog] = useState<DailyLog | null>(null);
  const [victory, setVictory] = useState<string | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  const [isToday, setIsToday] = useState(false);
  const [creatingLog, setCreatingLog] = useState(false);
  const [discharge, setDischarge] = useState("");

  const todayStr = today();

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

  const patch = async (fields: Partial<DailyLog>) => {
    if (!log) return;
    const updated = await updateLog(log.id, fields);
    setLog(updated);
  };

  const toggle = (key: keyof DailyLog) => {
    if (!log || !isToday) return;
    patch({ [key]: !log[key] });
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

  const recoveryCount = log ? RECOVERY_ITEMS.filter(([k]) => log[k]).length : 0;
  const progressCount = log ? PROGRESS_ITEMS.filter(([k]) => log[k]).length : 0;

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
              <button className="btn btn-accent victory-btn" onClick={handleVictoryAchieved}>
                ✅ 達成した！
              </button>
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
                <button
                  key={v}
                  className={`energy-btn ${log.energy_level === v ? "active" : ""}`}
                  onClick={() => patch({ energy_level: v })}
                >
                  {ENERGY_LABELS[v]}
                </button>
              ))}
            </div>
            <div className="section-label" style={{ marginTop: "1rem" }}>今日の目的</div>
            <div className="day-type-selector">
              {DAY_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  className={`day-type-btn ${log.day_type === value ? "active" : ""}`}
                  onClick={() => patch({ day_type: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 前進ポイント */}
        <div className="card checklist-card">
          <div className="section-label">⚔ 前進ポイント <span className="count-badge">{progressCount}/{PROGRESS_ITEMS.length}</span></div>
          <div className="checklist">
            {PROGRESS_ITEMS.map(([key, label]) => (
              <label
                key={key}
                className={`check-item ${log[key] ? "checked" : ""} ${!isToday ? "readonly" : ""}`}
                onClick={() => toggle(key)}
              >
                <span className="check-box">{log[key] ? "✅" : "⬜"}</span>
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="section-label" style={{ marginTop: "0.75rem" }}>
            睡眠 <span className="val-badge">{log.sleep_hours}h</span>
            {" "} 気分 <span className="val-badge">{["", "😞", "😕", "😐", "🙂", "😄"][log.mood_score]}</span>
          </div>
        </div>

        {/* 回復ポイント */}
        <div className="card checklist-card recovery">
          <div className="section-label">🛌 回復ポイント <span className="count-badge">{recoveryCount}/{RECOVERY_ITEMS.length}</span></div>
          <div className="checklist">
            {RECOVERY_ITEMS.map(([key, label]) => (
              <label
                key={key}
                className={`check-item ${log[key] ? "checked" : ""} ${!isToday ? "readonly" : ""}`}
                onClick={() => toggle(key)}
              >
                <span className="check-box">{log[key] ? "✅" : "⬜"}</span>
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 発散記録 */}
        {isToday && (
          <div className="card discharge-card">
            <div className="section-label">💨 今日の発散（記録のみ・否定なし）</div>
            <textarea
              className="discharge-input"
              placeholder="ゲーム、YouTube、パチンコ、映画... なんでもOK"
              value={discharge}
              onChange={(e) => setDischarge(e.target.value)}
              onBlur={handleDischargeBlur}
              rows={2}
            />
          </div>
        )}

        {/* アクション */}
        <div className="dashboard-actions">
          <Link to={`/log/edit/${log.id}`} className="btn btn-primary">詳細を編集</Link>
          <Link to="/logs" className="btn btn-accent">ログ一覧</Link>
        </div>

      </div>
    </div>
  );
}
