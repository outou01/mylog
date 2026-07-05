import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import {
  completeSeed,
  createSeed,
  deleteSeed,
  fetchSeeds,
  plantSeed,
  SeedPayload,
  SeedTask,
  updateSeed,
} from "../api/dreams";
import "./Dreams.css";

const DEFAULT_CATEGORIES = ["creation", "job_search", "social"];
const CATEGORY_LABEL: Record<string, string> = {
  creation: "創作",
  job_search: "転職活動",
  social: "交流",
  workout: "筋トレ",
};

const DEFAULT_SECTIONS: Record<string, string[]> = {
  creation: ["シナリオ", "インプット", "検証"],
  job_search: ["ポートフォリオ", "技術学習", "応募準備"],
  social: ["外出", "筋トレ", "身だしなみ"],
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

type DraftMap = Record<number, SeedPayload>;
type SectionMap = Record<string, string[]>;

function labelCategory(category: string) {
  return CATEGORY_LABEL[category] ?? category;
}

function noteText(seed: SeedPayload | SeedTask) {
  return [
    seed.notes,
    seed.purpose && `なぜやるか: ${seed.purpose}`,
    seed.importance && `なぜ大事か: ${seed.importance}`,
    seed.description && `手順: ${seed.description}`,
    seed.concern && `悩み: ${seed.concern}`,
    seed.motivation && `モチベーション源: ${seed.motivation}`,
  ].filter(Boolean).join("\n\n");
}

function editableNote(seed: SeedPayload | SeedTask) {
  return seed.notes ?? noteText({ ...seed, notes: null });
}

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

function newPayload(category: string, section: string, sortOrder: number, parent?: SeedTask): SeedPayload {
  return {
    title: parent ? "派生Todo" : "新しいTodo",
    category,
    parent_id: parent?.id ?? null,
    dream_id: parent?.dream_id ?? null,
    project_id: parent?.project_id ?? null,
    priority: "",
    depth: parent ? Math.min((parent.depth ?? 0) + 1, 12) : 0,
    sort_order: sortOrder,
    section,
    description: "",
    purpose: "",
    importance: "",
    concern: "",
    motivation: "",
    estimated_minutes: parent?.estimated_minutes ?? 30,
    actual_minutes: null,
    status: "active",
    notes: "",
  };
}

function readStoredSections(): SectionMap {
  try {
    return JSON.parse(localStorage.getItem("seed-sections") ?? "{}");
  } catch {
    return {};
  }
}

function readStoredCategories(): string[] {
  try {
    return JSON.parse(localStorage.getItem("seed-categories") ?? "[]");
  } catch {
    return [];
  }
}

export default function Seeds() {
  const [seeds, setSeeds] = useState<SeedTask[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [collapsedTodos, setCollapsedTodos] = useState<Set<number>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [customCategories, setCustomCategories] = useState<string[]>(readStoredCategories);
  const [customSections, setCustomSections] = useState<SectionMap>(readStoredSections);
  const [tab, setTab] = useState("active");
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [plantingId, setPlantingId] = useState<number | null>(null);

  const load = async () => {
    const data = await fetchSeeds();
    setSeeds(data);
    setDrafts(Object.fromEntries(data.map((seed) => [seed.id, toPayload(seed)])));
  };

  useEffect(() => {
    load();
  }, []);

  const categories = useMemo(() => {
    const fromSeeds = seeds.map((seed) => (drafts[seed.id] ?? seed).category).filter(Boolean);
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...customCategories, ...fromSeeds]));
  }, [customCategories, drafts, seeds]);

  const sectionsByCategory = useMemo(() => {
    const result: SectionMap = {};
    categories.forEach((category) => {
      const fromSeeds = seeds
        .map((seed) => drafts[seed.id] ?? toPayload(seed))
        .filter((seed) => seed.category === category)
        .map((seed) => seed.section || "未分類");
      result[category] = Array.from(new Set([...(DEFAULT_SECTIONS[category] ?? []), ...(customSections[category] ?? []), ...fromSeeds]));
    });
    return result;
  }, [categories, customSections, drafts, seeds]);

  const filteredSeeds = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return seeds.filter((seed) => {
      const draft = drafts[seed.id] ?? toPayload(seed);
      if (tab === "active" && !["active", "planted", "in_progress", "paused"].includes(draft.status)) return false;
      if (tab === "candidates" && draft.status !== "active") return false;
      if (tab === "done" && draft.status !== "done") return false;
      if (tab === "archived" && draft.status !== "archived") return false;
      if (!q) return true;
      return [draft.priority, draft.title, draft.category, draft.section, noteText(draft), draft.status].join(" ").toLowerCase().includes(q);
    });
  }, [drafts, keyword, seeds, tab]);

  const childrenByParent = useMemo(() => {
    const map = new Map<number, SeedTask[]>();
    filteredSeeds.forEach((seed) => {
      const parentId = (drafts[seed.id] ?? toPayload(seed)).parent_id;
      if (parentId != null) map.set(parentId, [...(map.get(parentId) ?? []), seed]);
    });
    map.forEach((items) => items.sort((a, b) => ((drafts[a.id]?.sort_order ?? a.sort_order) - (drafts[b.id]?.sort_order ?? b.sort_order)) || a.id - b.id));
    return map;
  }, [drafts, filteredSeeds]);

  const updateDraft = (id: number, patch: Partial<SeedPayload>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const save = async (seed: SeedTask) => {
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

  const nextOrder = () => Math.max(0, ...seeds.map((seed) => drafts[seed.id]?.sort_order ?? seed.sort_order ?? 0)) + 10;

  const addCategory = () => {
    const name = window.prompt("追加する親カテゴリ名");
    if (!name?.trim()) return;
    const value = name.trim();
    const next = Array.from(new Set([...customCategories, value]));
    setCustomCategories(next);
    localStorage.setItem("seed-categories", JSON.stringify(next));
  };

  const addSection = (category: string) => {
    const name = window.prompt(`${labelCategory(category)} に追加する小カテゴリ名`);
    if (!name?.trim()) return;
    const next = {
      ...customSections,
      [category]: Array.from(new Set([...(customSections[category] ?? []), name.trim()])),
    };
    setCustomSections(next);
    localStorage.setItem("seed-sections", JSON.stringify(next));
  };

  const addTodo = async (category: string, section: string, parent?: SeedTask) => {
    const created = await createSeed(newPayload(category, section, nextOrder(), parent));
    setSeeds((current) => [...current, created]);
    setDrafts((current) => ({ ...current, [created.id]: toPayload(created) }));
    if (parent) setCollapsedTodos((current) => {
      const next = new Set(current);
      next.delete(parent.id);
      return next;
    });
    setMessage(parent ? "子Todoを追加しました。" : "Todoを追加しました。");
  };

  const plant = async (seed: SeedTask) => {
    await save(seed);
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
  };

  const toggleSet = (setter: Dispatch<SetStateAction<Set<number>>>, id: number) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTodo = (seed: SeedTask): JSX.Element[] => {
    const draft = drafts[seed.id] ?? toPayload(seed);
    const childRows = childrenByParent.get(seed.id) ?? [];
    const isExpanded = expandedNotes.has(seed.id);
    const isCollapsed = collapsedTodos.has(seed.id);
    return [
      <tr key={seed.id} className={draft.status === "done" ? "is-done" : ""}>
        <td className="seed-tree-priority">
          <input value={draft.priority ?? ""} onChange={(event) => updateDraft(seed.id, { priority: event.target.value })} onBlur={() => save(seed)} />
        </td>
        <td className="seed-tree-section">
          <select value={draft.section ?? "未分類"} onChange={(event) => updateDraft(seed.id, { section: event.target.value })} onBlur={() => save(seed)}>
            {(sectionsByCategory[draft.category] ?? ["未分類"]).map((section) => <option value={section} key={section}>{section}</option>)}
          </select>
        </td>
        <td className="seed-tree-title" style={{ paddingLeft: 10 + draft.depth * 22 }}>
          <div className="seed-tree-title-inner">
            <button type="button" disabled={!childRows.length} onClick={() => toggleSet(setCollapsedTodos, seed.id)}>
              {childRows.length ? (isCollapsed ? "▶" : "▼") : "・"}
            </button>
            <input value={draft.title} onChange={(event) => updateDraft(seed.id, { title: event.target.value })} onBlur={() => save(seed)} />
          </div>
        </td>
        <td className="seed-tree-minutes">
          <div className="seed-tree-minutes-inner">
            <input type="number" min="5" max="480" value={draft.estimated_minutes} onChange={(event) => updateDraft(seed.id, { estimated_minutes: Number(event.target.value) })} onBlur={() => save(seed)} />
            <span>分</span>
          </div>
        </td>
        <td>
          <button className="seed-note-toggle" type="button" onClick={() => toggleSet(setExpandedNotes, seed.id)}>
            {isExpanded ? "閉じる" : "表示"}
          </button>
        </td>
        <td>
          <select value={draft.status} onChange={(event) => updateDraft(seed.id, { status: event.target.value })} onBlur={() => save(seed)}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </td>
        <td>
          <div className="seed-tree-actions">
            <button type="button" onClick={() => plant(seed)} disabled={plantingId === seed.id || draft.status === "done" || draft.status === "archived"}>今日植える</button>
            <button type="button" onClick={() => addTodo(draft.category, draft.section || "未分類", seed)}>子Todo追加</button>
            <button type="button" onClick={() => complete(seed)} disabled={draft.status === "done"}>完了</button>
            <button type="button" onClick={() => archive(seed)} disabled={draft.status === "archived"}>アーカイブ</button>
            <button type="button" onClick={() => remove(seed)}>削除</button>
            {savingId === seed.id && <span>保存中</span>}
          </div>
        </td>
      </tr>,
      ...(isExpanded ? [
        <tr className="seed-note-row" key={`${seed.id}-note`}>
          <td colSpan={7}>
            <textarea
              value={editableNote(draft)}
              placeholder="なぜやるか、なぜ大事か、悩み、モチベーション源、手順など"
              onChange={(event) => updateDraft(seed.id, { notes: event.target.value })}
              onBlur={() => save(seed)}
            />
          </td>
        </tr>,
      ] : []),
      ...(!isCollapsed ? childRows.flatMap(renderTodo) : []),
    ];
  };

  return (
    <div className="seeds-page seed-tree-page">
      <section className="seed-tree-head">
        <div>
          <p>種リスト</p>
          <h1>カテゴリ別ツリーTodo表</h1>
          <span>Excelの一覧性を残しながら、カテゴリ・見出し・派生Todoで整理します。</span>
        </div>
        <button type="button" onClick={addCategory}>親カテゴリ追加</button>
      </section>

      {message && <div className="plant-message">{message}</div>}

      <section className="seed-tree-toolbar">
        <div className="seed-tabs">
          {TABS.map((item) => (
            <button key={item.key} type="button" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <input placeholder="検索" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
      </section>

      <div className="seed-category-stack">
        {categories.map((category) => (
          <section className="seed-category-panel" key={category}>
            <header>
              <h2>{labelCategory(category)}</h2>
              <button type="button" onClick={() => addSection(category)}>小カテゴリ追加</button>
            </header>
            {(sectionsByCategory[category] ?? []).map((section) => {
              const sectionKey = `${category}:${section}`;
              const sectionSeeds = filteredSeeds
                .filter((seed) => {
                  const draft = drafts[seed.id] ?? toPayload(seed);
                  return draft.category === category && (draft.section || "未分類") === section && draft.parent_id == null;
                })
                .sort((a, b) => ((drafts[a.id]?.sort_order ?? a.sort_order) - (drafts[b.id]?.sort_order ?? b.sort_order)) || a.id - b.id);
              const collapsed = collapsedSections.has(sectionKey);
              return (
                <article className="seed-section-block" key={sectionKey}>
                  <div className="seed-section-title">
                    <button type="button" onClick={() => setCollapsedSections((current) => {
                      const next = new Set(current);
                      if (next.has(sectionKey)) next.delete(sectionKey);
                      else next.add(sectionKey);
                      return next;
                    })}>{collapsed ? "▶" : "▼"}</button>
                    <strong>{section}</strong>
                    <button type="button" onClick={() => addTodo(category, section)}>Todo追加</button>
                  </div>
                  {!collapsed && (
                    <div className="seed-tree-table-wrap">
                      <table className="seed-tree-table">
                        <thead>
                          <tr>
                            <th>優先度</th>
                            <th>カテゴリ</th>
                            <th>内容</th>
                            <th>所要時間</th>
                            <th>備考・悩み</th>
                            <th>状態</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionSeeds.flatMap(renderTodo)}
                          {!sectionSeeds.length && (
                            <tr>
                              <td colSpan={7} className="seed-empty-row">まだTodoがありません。</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
