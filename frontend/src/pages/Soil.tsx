import { FormEvent, useEffect, useRef, useState } from "react";
import {
  createSoilLog,
  deleteSoilLog,
  fetchSoilActions,
  fetchSoilAriaComment,
  fetchSoilSummary,
  SoilActionDef,
  SoilSummary,
} from "../api/client";
import "./Soil.css";

const CATEGORY_ORDER = ["body", "knowledge", "creation", "mind", "life"];
const CATEGORY_LABEL: Record<string, string> = {
  body: "身体", knowledge: "知識", creation: "創作", mind: "心", life: "生活",
};

export default function Soil() {
  const [summary, setSummary] = useState<SoilSummary | null>(null);
  const [actions, setActions] = useState<SoilActionDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState("creation");
  const [customMinutes, setCustomMinutes] = useState(15);
  const [showAllActions, setShowAllActions] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [ariaComment, setAriaComment] = useState<string | null>(null);
  const [ariaThinking, setAriaThinking] = useState(false);
  const [ariaFailed, setAriaFailed] = useState(false);
  const lastAriaFetch = useRef(0);

  const load = async () => {
    const [s, a] = await Promise.all([fetchSoilSummary(), fetchSoilActions()]);
    setSummary(s);
    setActions(a);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const quickAdd = async (def: SoilActionDef) => {
    if (saving) return;
    setSaving(true);
    try {
      await createSoilLog({ action_definition_id: def.id });
      setFlash(`${def.icon ?? "🌱"} ${def.name} を耕しました`);
      setTimeout(() => setFlash(null), 2500);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const submitCustom = async (event: FormEvent) => {
    event.preventDefault();
    if (!customName.trim() || saving) return;
    setSaving(true);
    try {
      await createSoilLog({
        action_name: customName.trim(),
        category_key: customCategory,
        duration_minutes: customMinutes,
      });
      setFlash(`🌱 ${customName.trim()} を耕しました`);
      setTimeout(() => setFlash(null), 2500);
      setCustomName("");
      setAddingCustom(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeLog = async (id: number) => {
    setSaving(true);
    try {
      await deleteSoilLog(id);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const askAria = async () => {
    if (ariaThinking) return;
    if (ariaComment && Date.now() - lastAriaFetch.current < 3 * 60 * 1000) return;
    setAriaThinking(true);
    setAriaFailed(false);
    try {
      const result = await fetchSoilAriaComment();
      if (result.is_ai) {
        setAriaComment(result.message);
        lastAriaFetch.current = Date.now();
      } else {
        setAriaFailed(true);
        setTimeout(() => setAriaFailed(false), 4000);
      }
    } catch {
      setAriaFailed(true);
      setTimeout(() => setAriaFailed(false), 4000);
    } finally {
      setAriaThinking(false);
    }
  };

  if (!summary) {
    return <div className="soil-page"><p className="soil-muted">読み込み中...</p></div>;
  }

  const quickByCategory = CATEGORY_ORDER.map((key) => ({
    key,
    defs: actions.filter((a) => a.category_key === key && a.is_quick),
  }));
  const recommendedField = [...summary.categories].sort((a, b) => a.score - b.score)[0];
  const recommendedAction =
    actions.find((action) => action.category_key === recommendedField?.key && action.is_quick) ??
    actions.find((action) => action.is_quick);

  return (
    <div className="soil-page">

      {flash && <div className="soil-flash">{flash}</div>}

      {/* ── 今日の一言 ── */}
      <section className="card soil-headline-card">
        <p className="soil-subtitle">自分の畑を、毎日少しずつ耕す。</p>
        <h2 className="soil-headline">{summary.headline}</h2>
        <div
          className={`soil-aria-bubble ${ariaComment ? "ai" : ""} ${ariaThinking ? "thinking" : ""}`}
          onClick={askAria}
          title="タップするとアリアが畑を見てコメントします"
        >
          <span className="soil-aria-face">
            {ariaThinking ? "(・ω・ )?" : "(＾ω＾)"} アリア
          </span>
          <p>
            {ariaThinking
              ? "……（畑を観察中）"
              : ariaFailed
                ? "（電波が悪いみたいです…少ししたらまたタップしてください）"
                : ariaComment
                  ? `✨ ${ariaComment}`
                  : summary.aria_message}
          </p>
          {!ariaComment && !ariaThinking && !ariaFailed && (
            <span className="soil-aria-hint">タップでアリアに聞く</span>
          )}
        </div>
      </section>

      {/* ── 5つの畑 ── */}
      <div className="soil-fields-grid">
        {summary.categories.map((field) => (
          <section className="card soil-field-card" key={field.key} style={{ borderLeftColor: field.color }}>
            <div className="soil-field-head">
              <span className="soil-field-icon" style={{ background: `${field.color}22` }}>{field.icon}</span>
              <div>
                <strong>{field.name}</strong>
                <span className="soil-field-label">{field.label}</span>
              </div>
              <span className="soil-field-score">{field.score}</span>
            </div>
            <div className="soil-bar-track">
              <div className="soil-bar-fill" style={{ width: `${field.score}%`, background: field.color }} />
            </div>
            {field.recent.length > 0 ? (
              <ul className="soil-field-recent">
                {field.recent.map((r, i) => (
                  <li key={i}>
                    <span>{r.date_label}</span> {r.name}
                    {r.duration_minutes ? ` ${r.duration_minutes}分` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="soil-field-empty">この7日はまだ静かです</p>
            )}
            <p className="soil-field-suggestion">💧 {field.suggestion}</p>
          </section>
        ))}

        {/* 全体の畑（補助表示） */}
        <section className="card soil-field-card soil-overall-card">
          <div className="soil-field-head">
            <span className="soil-field-icon">🌾</span>
            <div>
              <strong>今週の自分の畑</strong>
              <span className="soil-field-label">全体</span>
            </div>
            <span className="soil-field-score">{summary.overall_score}</span>
          </div>
          <div className="soil-bar-track">
            <div className="soil-bar-fill" style={{ width: `${summary.overall_score}%` }} />
          </div>
          <p className="soil-field-suggestion">{summary.overall_note}</p>
        </section>
      </div>

      {/* ── クイック追加 ── */}
      <section className="card soil-quick-card">
        <p className="soil-kicker">今日のおすすめ</p>
        <div className="soil-recommend-box">
          <div>
            <strong>{recommendedField?.name ?? "自分の畑"}に水をあげる</strong>
            <span>{recommendedField?.suggestion ?? "5分だけ耕す"}</span>
          </div>
          {recommendedAction && (
            <button className="soil-usual-btn" onClick={() => quickAdd(recommendedAction)} disabled={saving}>
              {recommendedAction.icon} {recommendedAction.name}
              {recommendedAction.default_minutes ? ` ${recommendedAction.default_minutes}分` : ""}
            </button>
          )}
        </div>

        <button className="soil-adjust-btn soil-custom-toggle" onClick={() => setShowAllActions((current) => !current)}>
          {showAllActions ? "候補を閉じる" : "別の行動を記録"}
        </button>

        {showAllActions && quickByCategory.map(({ key, defs }) => defs.length > 0 && (
          <div className="soil-quick-group" key={key}>
            <span className="soil-quick-label">{CATEGORY_LABEL[key]}</span>
            <div className="soil-chip-row">
              {defs.map((def) => (
                <button key={def.id} className="soil-chip" onClick={() => quickAdd(def)} disabled={saving}>
                  {def.icon} {def.name}
                  {def.default_minutes ? ` ${def.default_minutes}分` : ""}
                </button>
              ))}
            </div>
          </div>
        ))}

        {showAllActions && (addingCustom ? (
          <form className="soil-custom-form" onSubmit={submitCustom}>
            <input
              placeholder="やったこと（例: 皿洗い）"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              autoFocus
            />
            <div className="soil-chip-row">
              {CATEGORY_ORDER.map((key) => (
                <button type="button" key={key}
                  className={`soil-chip ${customCategory === key ? "active" : ""}`}
                  onClick={() => setCustomCategory(key)}>
                  {CATEGORY_LABEL[key]}
                </button>
              ))}
            </div>
            <div className="soil-chip-row">
              {[5, 10, 15, 30, 60].map((m) => (
                <button type="button" key={m}
                  className={`soil-chip ${customMinutes === m ? "active" : ""}`}
                  onClick={() => setCustomMinutes(m)}>
                  {m}分
                </button>
              ))}
            </div>
            <div className="soil-custom-actions">
              <button type="submit" className="soil-usual-btn" disabled={saving || !customName.trim()}>記録する</button>
              <button type="button" className="soil-adjust-btn" onClick={() => setAddingCustom(false)}>閉じる</button>
            </div>
          </form>
        ) : (
          <button className="soil-adjust-btn soil-custom-toggle" onClick={() => setAddingCustom(true)}>
            ＋ その他の行動を記録
          </button>
        ))}
      </section>

      {/* ── 最近耕したこと ── */}
      {summary.recent_logs.length > 0 && (
        <section className="card soil-recent-card">
          <p className="soil-kicker">最近耕したこと</p>
          <ul className="soil-recent-list">
            {summary.recent_logs.map((log) => (
              <li key={log.id}>
                <span className="soil-recent-date">{log.date_label}</span>
                <span className="soil-recent-name">
                  {log.action_name}
                  {log.duration_minutes ? ` ${log.duration_minutes}分` : ""}
                </span>
                <span className="soil-recent-cat">{log.source_type === "calendar" ? "カレンダー" : log.category_name}</span>
                {log.source_type !== "calendar" && (
                  <button className="soil-recent-delete" onClick={() => removeLog(log.id)} disabled={saving} title="削除">×</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}
