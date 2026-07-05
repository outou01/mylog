import { useEffect, useMemo, useState } from "react";
import {
  completeSeed,
  createSeed,
  deleteSeed,
  Dream,
  fetchDreams,
  fetchSeeds,
  plantSeed,
  SeedPayload,
  SeedTask,
  updateSeed,
} from "../api/dreams";
import "./Dreams.css";

const CATEGORY_LABEL: Record<string, string> = {
  creation: "創作",
  social: "交流",
  job_search: "転職活動",
  workout: "筋トレ",
};

const STATUS_LABEL: Record<string, string> = {
  active: "未着手",
  planted: "今日植えた",
  in_progress: "進行中",
  done: "完了",
  archived: "アーカイブ",
  paused: "保留",
};

const TABS = [
  { key: "active", label: "進行中" },
  { key: "candidates", label: "今日植える候補" },
  { key: "done", label: "完了済み" },
  { key: "archived", label: "アーカイブ" },
  { key: "all", label: "すべて" },
];

const TEXT_COLUMNS = ["description", "purpose", "importance", "concern", "motivation", "notes"] as const;
type TextColumn = (typeof TEXT_COLUMNS)[number];
type SeedField = keyof SeedPayload;
type DraftMap = Record<number, SeedPayload>;

const DEFAULT_WIDTHS: Record<string, number> = {
  id: 72,
  parent_id: 78,
  depth: 70,
  category: 116,
  project: 170,
  title: 240,
  description: 280,
  estimated_minutes: 92,
  purpose: 260,
  importance: 260,
  concern: 220,
  motivation: 220,
  status: 118,
  completed_at: 112,
  actions: 260,
};

const emptySeed = (sortOrder: number, parent?: SeedTask): SeedPayload => ({
  title: parent ? "派生タスク" : "新規タスク",
  category: parent?.category ?? "creation",
  parent_id: parent?.id ?? null,
  dream_id: parent?.dream_id ?? null,
  project_id: parent?.project_id ?? null,
  priority: "",
  depth: parent ? Math.min((parent.depth ?? 0) + 1, 12) : 0,
  sort_order: sortOrder,
  section: parent?.section ?? "",
  description: "",
  purpose: parent?.purpose ?? "",
  importance: parent?.importance ?? "",
  concern: "",
  motivation: parent?.motivation ?? "",
  estimated_minutes: parent?.estimated_minutes ?? 30,
  actual_minutes: null,
  status: "active",
  notes: "",
});

function toPayload(seed: SeedTask): SeedPayload {
  return {
    title: seed.title,
    category: seed.category,
    parent_id: seed.parent_id,
    dream_id: seed.dream_id,
    project_id: seed.project_id,
    priority: seed.priority,
    depth: seed.depth,
    sort_order: seed.sort_order,
    section: seed.section,
    description: seed.description,
    purpose: seed.purpose,
    importance: seed.importance,
    concern: seed.concern,
    motivation: seed.motivation,
    estimated_minutes: seed.estimated_minutes,
    actual_minutes: seed.actual_minutes,
    status: seed.status,
    notes: seed.notes,
  };
}

function statusClass(status: string) {
  return `seed-status ${status}`;
}

export default function Seeds() {
  const [seeds, setSeeds] = useState<SeedTask[]>([]);
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [editingLongText, setEditingLongText] = useState<{ id: number; field: TextColumn } | null>(null);
  const [columnWidths, setColumnWidths] = useState(DEFAULT_WIDTHS);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [plantingId, setPlantingId] = useState<number | null>(null);

  const load = async () => {
    const [seedData, dreamData] = await Promise.all([fetchSeeds(), fetchDreams()]);
    setSeeds(seedData);
    setDrafts(Object.fromEntries(seedData.map((seed) => [seed.id, toPayload(seed)])));
    setDreams(dreamData);
  };

  useEffect(() => {
    load();
  }, []);

  const dreamById = useMemo(() => new Map(dreams.map((dream) => [dream.id, dream])), [dreams]);
  const projectOptions = useMemo(
    () => dreams.filter((dream) => dream.linked_project_id != null).map((dream) => ({ id: dream.linked_project_id as number, label: dream.title })),
    [dreams],
  );

  const filteredSeeds = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return seeds.filter((seed) => {
      const draft = drafts[seed.id] ?? toPayload(seed);
      if (tab === "active" && !["active", "planted", "in_progress", "paused"].includes(draft.status)) return false;
      if (tab === "candidates" && draft.status !== "active") return false;
      if (tab === "done" && draft.status !== "done") return false;
      if (tab === "archived" && draft.status !== "archived") return false;
      if (categoryFilter && draft.category !== categoryFilter) return false;
      if (projectFilter && String(draft.project_id ?? "") !== projectFilter) return false;
      if (statusFilter && draft.status !== statusFilter) return false;
      if (!q) return true;
      return [
        seed.id,
        draft.parent_id,
        draft.priority,
        draft.category,
        draft.section,
        draft.title,
        draft.description,
        draft.purpose,
        draft.importance,
        draft.concern,
        draft.motivation,
        draft.notes,
        dreamById.get(draft.dream_id ?? -1)?.title,
      ].join(" ").toLowerCase().includes(q);
    });
  }, [categoryFilter, drafts, dreamById, keyword, projectFilter, seeds, statusFilter, tab]);

  const visibleSeeds = useMemo(() => {
    const byParent = new Map<number | null, SeedTask[]>();
    filteredSeeds.forEach((seed) => {
      const draft = drafts[seed.id] ?? toPayload(seed);
      const parentId = draft.parent_id ?? null;
      byParent.set(parentId, [...(byParent.get(parentId) ?? []), seed]);
    });
    byParent.forEach((items) => {
      items.sort((a, b) => {
        const da = drafts[a.id] ?? toPayload(a);
        const db = drafts[b.id] ?? toPayload(b);
        return (da.sort_order ?? 0) - (db.sort_order ?? 0) || a.id - b.id;
      });
    });

    const rows: SeedTask[] = [];
    const visit = (parentId: number | null) => {
      (byParent.get(parentId) ?? []).forEach((seed) => {
        rows.push(seed);
        if (!collapsed.has(seed.id)) visit(seed.id);
      });
    };
    visit(null);
    filteredSeeds
      .filter((seed) => {
        const parentId = (drafts[seed.id] ?? toPayload(seed)).parent_id;
        return parentId != null && !filteredSeeds.some((item) => item.id === parentId) && !rows.some((item) => item.id === seed.id);
      })
      .forEach((seed) => rows.push(seed));
    return rows;
  }, [collapsed, drafts, filteredSeeds]);

  const childrenByParent = useMemo(() => {
    const map = new Map<number, number>();
    seeds.forEach((seed) => {
      const parentId = (drafts[seed.id] ?? toPayload(seed)).parent_id;
      if (parentId != null) map.set(parentId, (map.get(parentId) ?? 0) + 1);
    });
    return map;
  }, [drafts, seeds]);

  const updateDraft = (id: number, field: SeedField, value: SeedPayload[SeedField]) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  };

  const saveSeed = async (seed: SeedTask) => {
    const draft = drafts[seed.id];
    if (!draft || !draft.title.trim()) return;
    setSavingId(seed.id);
    try {
      const saved = await updateSeed(seed.id, draft);
      setSeeds((current) => current.map((item) => (item.id === seed.id ? saved : item)));
      setDrafts((current) => ({ ...current, [seed.id]: toPayload(saved) }));
    } finally {
      setSavingId(null);
    }
  };

  const addRow = async (parent?: SeedTask) => {
    const nextOrder = Math.max(0, ...seeds.map((seed) => (drafts[seed.id]?.sort_order ?? seed.sort_order ?? 0))) + 10;
    const created = await createSeed(emptySeed(nextOrder, parent));
    setSeeds((current) => [...current, created]);
    setDrafts((current) => ({ ...current, [created.id]: toPayload(created) }));
    setMessage(parent ? `${parent.title} の子タスクを追加しました。` : "新規行を追加しました。");
  };

  const duplicateRow = async (seed: SeedTask) => {
    const draft = drafts[seed.id] ?? toPayload(seed);
    const created = await createSeed({
      ...draft,
      title: `${draft.title} コピー`,
      sort_order: (draft.sort_order ?? 0) + 1,
      status: "active",
    });
    setSeeds((current) => [...current, created]);
    setDrafts((current) => ({ ...current, [created.id]: toPayload(created) }));
    setMessage("行を複製しました。");
  };

  const moveRow = async (seed: SeedTask, direction: -1 | 1) => {
    const index = visibleSeeds.findIndex((item) => item.id === seed.id);
    const other = visibleSeeds[index + direction];
    if (!other) return;
    const draft = drafts[seed.id] ?? toPayload(seed);
    const otherDraft = drafts[other.id] ?? toPayload(other);
    const next = { ...draft, sort_order: otherDraft.sort_order ?? 0 };
    const nextOther = { ...otherDraft, sort_order: draft.sort_order ?? 0 };
    const [saved, savedOther] = await Promise.all([updateSeed(seed.id, next), updateSeed(other.id, nextOther)]);
    setSeeds((current) => current.map((item) => (item.id === saved.id ? saved : item.id === savedOther.id ? savedOther : item)));
    setDrafts((current) => ({ ...current, [saved.id]: toPayload(saved), [savedOther.id]: toPayload(savedOther) }));
  };

  const plant = async (seed: SeedTask) => {
    await saveSeed(seed);
    setPlantingId(seed.id);
    try {
      const planted = await plantSeed(seed.id);
      setMessage(`${seed.title} を ${planted.start_time}-${planted.end_time} に植えました。`);
      await load();
    } finally {
      setPlantingId(null);
    }
  };

  const complete = async (seed: SeedTask) => {
    const draft = drafts[seed.id] ?? toPayload(seed);
    const saved = await completeSeed(seed.id, draft.actual_minutes || draft.estimated_minutes);
    setSeeds((current) => current.map((item) => (item.id === seed.id ? saved : item)));
    setDrafts((current) => ({ ...current, [seed.id]: toPayload(saved) }));
  };

  const archive = async (seed: SeedTask) => {
    const saved = await updateSeed(seed.id, { ...(drafts[seed.id] ?? toPayload(seed)), status: "archived" });
    setSeeds((current) => current.map((item) => (item.id === seed.id ? saved : item)));
    setDrafts((current) => ({ ...current, [seed.id]: toPayload(saved) }));
  };

  const remove = async (seed: SeedTask) => {
    await deleteSeed(seed.id);
    setSeeds((current) => current.filter((item) => item.id !== seed.id));
    setDrafts((current) => {
      const next = { ...current };
      delete next[seed.id];
      return next;
    });
  };

  const resizeColumn = (key: string, startX: number) => {
    const startWidth = columnWidths[key] ?? 140;
    const onMove = (event: MouseEvent) => {
      const nextWidth = Math.max(64, startWidth + event.clientX - startX);
      setColumnWidths((current) => ({ ...current, [key]: nextWidth }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const longTextTarget = editingLongText ? drafts[editingLongText.id] : null;

  return (
    <div className="seeds-page sheet-mode">
      <section className="sheet-head">
        <div>
          <p>種リスト</p>
          <h1>Excel型タスクDB</h1>
          <span>1行ずつ直接編集して、派生タスクも同じ表の中で管理します。</span>
        </div>
        <button type="button" onClick={() => addRow()}>新規行追加</button>
      </section>

      {message && <div className="plant-message">{message}</div>}

      <section className="sheet-toolbar">
        <div className="seed-tabs">
          {TABS.map((item) => (
            <button key={item.key} type="button" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="seed-filters">
          <input placeholder="検索" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">カテゴリすべて</option>
            <option value="creation">創作</option>
            <option value="social">交流</option>
            <option value="job_search">転職活動</option>
            <option value="workout">筋トレ</option>
          </select>
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="">プロジェクトすべて</option>
            {projectOptions.map((project) => <option value={project.id} key={project.id}>{project.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">状態すべて</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </div>
      </section>

      <section className="sheet-wrap">
        <table className="seed-sheet" style={{ minWidth: Object.values(columnWidths).reduce((sum, width) => sum + width, 0) }}>
          <thead>
            <tr>
              {[
                ["id", "ID"],
                ["parent_id", "親ID"],
                ["depth", "階層"],
                ["category", "カテゴリ"],
                ["project", "プロジェクト"],
                ["title", "タスク名"],
                ["description", "内容"],
                ["estimated_minutes", "所要"],
                ["purpose", "なぜやるか"],
                ["importance", "なぜ大事か"],
                ["concern", "悩み"],
                ["motivation", "モチベーション源"],
                ["status", "状態"],
                ["completed_at", "完了日"],
                ["actions", "操作"],
              ].map(([key, label]) => (
                <th key={key} style={{ width: columnWidths[key] }}>
                  {label}
                  <span className="col-resizer" onMouseDown={(event) => resizeColumn(key, event.clientX)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleSeeds.map((seed) => {
              const draft = drafts[seed.id] ?? toPayload(seed);
              const hasChildren = (childrenByParent.get(seed.id) ?? 0) > 0;
              const dream = dreamById.get(draft.dream_id ?? -1);
              return (
                <tr key={seed.id} className={draft.status === "done" ? "is-done" : ""}>
                  <td>{seed.id}</td>
                  <td>
                    <input
                      value={draft.parent_id ?? ""}
                      onChange={(event) => updateDraft(seed.id, "parent_id", event.target.value ? Number(event.target.value) : null)}
                      onBlur={() => saveSeed(seed)}
                    />
                  </td>
                  <td>
                    <input
                      value={draft.depth}
                      type="number"
                      min="0"
                      max="12"
                      onChange={(event) => updateDraft(seed.id, "depth", Number(event.target.value))}
                      onBlur={() => saveSeed(seed)}
                    />
                  </td>
                  <td>
                    <select value={draft.category} onChange={(event) => updateDraft(seed.id, "category", event.target.value)} onBlur={() => saveSeed(seed)}>
                      <option value="creation">創作</option>
                      <option value="social">交流</option>
                      <option value="job_search">転職活動</option>
                      <option value="workout">筋トレ</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={draft.project_id ?? ""}
                      onChange={(event) => {
                        const projectId = event.target.value ? Number(event.target.value) : null;
                        const dreamOption = dreams.find((item) => item.linked_project_id === projectId);
                        updateDraft(seed.id, "project_id", projectId);
                        updateDraft(seed.id, "dream_id", dreamOption?.id ?? null);
                        if (dreamOption) updateDraft(seed.id, "category", dreamOption.category);
                      }}
                      onBlur={() => saveSeed(seed)}
                    >
                      <option value="">なし</option>
                      {projectOptions.map((project) => <option value={project.id} key={project.id}>{project.label}</option>)}
                    </select>
                    {dream && <small>{dream.title}</small>}
                  </td>
                  <td className="task-title-cell" style={{ paddingLeft: 8 + draft.depth * 18 }}>
                    <div className="task-title-inner">
                      <button
                        className="tree-toggle"
                        type="button"
                        disabled={!hasChildren}
                        onClick={() => setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(seed.id)) next.delete(seed.id);
                          else next.add(seed.id);
                          return next;
                        })}
                      >
                        {hasChildren ? (collapsed.has(seed.id) ? "▶" : "▼") : "・"}
                      </button>
                      <input value={draft.title} onChange={(event) => updateDraft(seed.id, "title", event.target.value)} onBlur={() => saveSeed(seed)} />
                    </div>
                  </td>
                  <LongTextCell seed={seed} draft={draft} field="description" updateDraft={updateDraft} saveSeed={saveSeed} setEditingLongText={setEditingLongText} />
                  <td>
                    <input
                      type="number"
                      min="5"
                      max="480"
                      value={draft.estimated_minutes}
                      onChange={(event) => updateDraft(seed.id, "estimated_minutes", Number(event.target.value))}
                      onBlur={() => saveSeed(seed)}
                    />
                  </td>
                  <LongTextCell seed={seed} draft={draft} field="purpose" updateDraft={updateDraft} saveSeed={saveSeed} setEditingLongText={setEditingLongText} />
                  <LongTextCell seed={seed} draft={draft} field="importance" updateDraft={updateDraft} saveSeed={saveSeed} setEditingLongText={setEditingLongText} />
                  <LongTextCell seed={seed} draft={draft} field="concern" updateDraft={updateDraft} saveSeed={saveSeed} setEditingLongText={setEditingLongText} />
                  <LongTextCell seed={seed} draft={draft} field="motivation" updateDraft={updateDraft} saveSeed={saveSeed} setEditingLongText={setEditingLongText} />
                  <td>
                    <select value={draft.status} onChange={(event) => updateDraft(seed.id, "status", event.target.value)} onBlur={() => saveSeed(seed)}>
                      {Object.entries(STATUS_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                    <span className={statusClass(draft.status)}>{STATUS_LABEL[draft.status] ?? draft.status}</span>
                  </td>
                  <td>{seed.completed_at ? seed.completed_at.slice(0, 10) : ""}</td>
                  <td>
                    <div className="sheet-actions">
                      <button type="button" onClick={() => plant(seed)} disabled={plantingId === seed.id || draft.status === "done" || draft.status === "archived"}>
                        今日植える
                      </button>
                      <button type="button" onClick={() => addRow(seed)}>子追加</button>
                      <button type="button" onClick={() => duplicateRow(seed)}>複製</button>
                      <button type="button" onClick={() => moveRow(seed, -1)}>↑</button>
                      <button type="button" onClick={() => moveRow(seed, 1)}>↓</button>
                      <button type="button" onClick={() => complete(seed)} disabled={draft.status === "done"}>完了</button>
                      <button type="button" onClick={() => archive(seed)} disabled={draft.status === "archived"}>アーカイブ</button>
                      <button type="button" onClick={() => remove(seed)}>削除</button>
                      {savingId === seed.id && <span>保存中</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visibleSeeds.length && (
              <tr>
                <td colSpan={15} className="sheet-empty">条件に合う行がありません。新規行追加から作れます。</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {editingLongText && longTextTarget && (
        <div className="sheet-modal-backdrop" onClick={() => setEditingLongText(null)}>
          <div className="sheet-modal" onClick={(event) => event.stopPropagation()}>
            <div>
              <p>{longTextTarget.title}</p>
              <h2>{longTextLabel(editingLongText.field)}</h2>
            </div>
            <textarea
              value={(longTextTarget[editingLongText.field] as string | null) ?? ""}
              onChange={(event) => updateDraft(editingLongText.id, editingLongText.field, event.target.value)}
            />
            <div className="dream-form-actions">
              <button type="button" onClick={async () => {
                const seed = seeds.find((item) => item.id === editingLongText.id);
                if (seed) await saveSeed(seed);
                setEditingLongText(null);
              }}>保存して閉じる</button>
              <button type="button" onClick={() => setEditingLongText(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LongTextCell({
  seed,
  draft,
  field,
  updateDraft,
  saveSeed,
  setEditingLongText,
}: {
  seed: SeedTask;
  draft: SeedPayload;
  field: TextColumn;
  updateDraft: (id: number, field: SeedField, value: SeedPayload[SeedField]) => void;
  saveSeed: (seed: SeedTask) => Promise<void>;
  setEditingLongText: (value: { id: number; field: TextColumn }) => void;
}) {
  return (
    <td className="long-cell">
      <div className="long-cell-inner">
        <textarea
          value={(draft[field] as string | null) ?? ""}
          onChange={(event) => updateDraft(seed.id, field, event.target.value)}
          onBlur={() => saveSeed(seed)}
        />
        <button type="button" onClick={() => setEditingLongText({ id: seed.id, field })}>全文</button>
      </div>
    </td>
  );
}

function longTextLabel(field: TextColumn) {
  const labels: Record<TextColumn, string> = {
    description: "内容",
    purpose: "なぜやるか",
    importance: "なぜ大事か",
    concern: "悩み",
    motivation: "モチベーション源",
    notes: "メモ",
  };
  return labels[field];
}
