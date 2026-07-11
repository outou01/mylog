import { FormEvent, useEffect, useState } from "react";
import {
  createSoilLog,
  deleteSoilLog,
  fetchSoilActions,
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
  const recentLogs = summary.recent_logs.slice(0, 5);

  return (
    <div className="soil-page">

      {flash && <div className="soil-flash">{flash}</div>}

      <section className="soil-minimal-head">
        <div>
          <p>土壌</p>
          <h2>直近7日の畑</h2>
        </div>
        <span>{summary.overall_score}%</span>
      </section>

      <section className="soil-field-list" aria-label="直近7日の畑の状態">
        {summary.categories.map((field) => (
          <div className="soil-field-row" key={field.key}>
            <div className="soil-field-main">
              <span className="soil-field-name">{field.icon} {field.name}</span>
              <div className="soil-bar-track">
                <div className="soil-bar-fill" style={{ width: `${field.score}%`, background: field.color }} />
              </div>
            </div>
            <div className="soil-field-side">
              <strong>{field.score}%</strong>
              <span>{field.label}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="soil-next-action">
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

      {recentLogs.length > 0 && (
        <section className="soil-recent-card">
          <p className="soil-kicker">最近耕したこと</p>
          <ul className="soil-recent-list">
            {recentLogs.map((log) => (
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
