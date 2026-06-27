import { useEffect, useState } from "react";
import {
  fetchWeekendBriefing, upsertMonthlyTheme, saveWeekendNote, BriefingOut,
} from "../api/client";
import "./Briefing.css";

export default function Briefing() {
  const [briefing, setBriefing] = useState<BriefingOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [themeText, setThemeText] = useState("");
  const [editingTheme, setEditingTheme] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  const [nextAction, setNextAction] = useState("");
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    fetchWeekendBriefing()
      .then((b) => {
        setBriefing(b);
        setThemeText(b.theme_text ?? "");
        setNextAction(b.suggested_action);
      })
      .catch(() => setError("今週のログがまだありません。先にログを記録してください。"))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveTheme = async () => {
    setSavingTheme(true);
    try {
      await upsertMonthlyTheme(themeText);
      setEditingTheme(false);
    } finally {
      setSavingTheme(false);
    }
  };

  const handleSaveNote = async () => {
    await saveWeekendNote(nextAction);
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 2000);
  };

  if (loading) return <div className="br-loading">Loading...</div>;
  if (error || !briefing) return <div className="br-loading">{error}</div>;

  const habitItems = [
    { icon: "💪", label: "筋トレ", days: briefing.workout_days, target: 2, unit: "回" },
    { icon: "🎨", label: "創作", days: briefing.create_days, target: 3, unit: "日" },
    { icon: "💻", label: "開発", days: briefing.code_days, target: 3, unit: "日" },
    { icon: "🍺", label: "飲酒", days: briefing.alcohol_days, target: 0, unit: "日", invert: true },
  ];

  return (
    <div className="br-page">
      <div className="br-top">
        <div>
          <h1 className="page-title">週末ブリーフィング</h1>
          <p className="br-period">{briefing.week_start} 〜 {briefing.week_end}</p>
        </div>
        <span className="br-month-badge">{briefing.month}</span>
      </div>

      {/* 今月のテーマ */}
      <div className="card br-theme-card">
        <div className="br-section-label">🎯 今月のテーマ</div>
        {editingTheme ? (
          <div className="br-theme-edit">
            <textarea
              rows={4}
              value={themeText}
              onChange={(e) => setThemeText(e.target.value)}
              placeholder="例: 転職60% / 創作30% / AI10%&#10;転職を主軸にしながら創作の火を消さない。"
            />
            <div className="br-theme-actions">
              <button className="btn btn-primary" onClick={handleSaveTheme} disabled={savingTheme}>
                {savingTheme ? "保存中..." : "保存"}
              </button>
              <button className="btn btn-accent" onClick={() => setEditingTheme(false)}>キャンセル</button>
            </div>
          </div>
        ) : (
          <div className="br-theme-display" onClick={() => setEditingTheme(true)}>
            {themeText
              ? <pre className="br-theme-text">{themeText}</pre>
              : <span className="br-theme-empty">クリックして今月のテーマを設定する...</span>
            }
            <span className="br-edit-hint">✏️ クリックで編集</span>
          </div>
        )}
      </div>

      {/* 今週の実績 */}
      <div className="card br-stats-card">
        <div className="br-section-label">📊 今週の実績</div>
        <div className="br-habit-row">
          {habitItems.map((h) => {
            const achieved = h.invert ? h.days === h.target : h.days >= h.target;
            return (
              <div key={h.label} className={`br-habit ${achieved ? "ok" : "ng"}`}>
                <span className="br-habit-icon">{h.icon}</span>
                <span className="br-habit-count">{h.days}{h.unit}</span>
                <span className="br-habit-label">{h.label}</span>
                <span className="br-habit-check">{achieved ? "✓" : `目標: ${h.invert ? "0" : h.target}${h.unit}`}</span>
              </div>
            );
          })}
        </div>
        <div className="br-sub-stats">
          <span>😴 平均睡眠 <strong style={{ color: briefing.avg_sleep >= 7 ? "var(--green)" : "var(--yellow)" }}>{briefing.avg_sleep}h</strong></span>
          <span>😊 平均気分 <strong>{briefing.avg_mood}/5</strong></span>
        </div>
      </div>

      {/* 先週決めたこと */}
      {briefing.last_next_action && (
        <div className="card br-last-card">
          <div className="br-section-label">📌 先週末に決めたこと</div>
          <p className="br-last-action">→ {briefing.last_next_action}</p>
        </div>
      )}

      {/* AIアドバイス */}
      <div className="card br-ai-card">
        <div className="br-ai-header">
          <span className="ai-badge">AI BRIEFING</span>
        </div>
        <p className="br-ai-advice">{briefing.ai_advice}</p>
      </div>

      {/* 今週末やること */}
      <div className="card br-note-card">
        <div className="br-section-label">🎯 今週末やること（1つだけ）</div>
        <div className="br-note-input">
          <input
            type="text"
            value={nextAction}
            onChange={(e) => { setNextAction(e.target.value); setSavedNote(false); }}
            placeholder="例: シナリオの書き出しだけやる"
          />
          <button className="btn btn-primary" onClick={handleSaveNote} disabled={!nextAction.trim()}>
            {savedNote ? "✓ 保存済" : "記録する"}
          </button>
        </div>
        <p className="br-note-hint">来週末のブリーフィングで「先週決めたこと」として表示されます</p>
      </div>
    </div>
  );
}
