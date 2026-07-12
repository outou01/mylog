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
import { scheduleCategoryLabel } from "../constants/categories";
import "./Dreams.css";

const UNCATEGORIZED = "-";
const DEFAULT_CATEGORIES = ["creation", "job_search", "social"];
const DEFAULT_SECTIONS: Record<string, string[]> = {
  creation: ["シナリオ", "インプット", "検証"],
  job_search: ["ポートフォリオ", "技術学習", "応募準備"],
  social: ["外出", "筋トレ", "身だしなみ"],
};

type DraftMap = Record<number, SeedPayload>;
type SectionMap = Record<string, string[]>;
type View = "all" | "today" | "cold";
type DragState =
  | { type: "section"; category: string; section: string }
  | { type: "todo"; id: number }
  | null;

function storageJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}

function normalizeSection(section: string | null | undefined) {
  return section?.trim() || UNCATEGORIZED;
}

function toPayload(seed: SeedTask): SeedPayload {
  return {
    title: seed.title, category: seed.category, parent_id: seed.parent_id,
    dream_id: seed.dream_id, project_id: seed.project_id, priority: seed.priority,
    depth: seed.depth, sort_order: seed.sort_order, section: normalizeSection(seed.section),
    description: seed.description, purpose: seed.purpose, importance: seed.importance,
    concern: seed.concern, motivation: seed.motivation,
    estimated_minutes: seed.estimated_minutes, actual_minutes: seed.actual_minutes,
    status: seed.status, notes: seed.notes,
  };
}

function newPayload(category: string, section: string, sortOrder: number, title: string, parent?: SeedTask): SeedPayload {
  return {
    title, category, parent_id: parent?.id ?? null, dream_id: parent?.dream_id ?? null,
    project_id: parent?.project_id ?? null, priority: "", depth: parent ? Math.min(parent.depth + 1, 12) : 0,
    sort_order: sortOrder, section, description: "", purpose: "", importance: "",
    concern: "", motivation: "", estimated_minutes: parent?.estimated_minutes ?? 30,
    actual_minutes: null, status: "active", notes: "",
  };
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysSince(value: string | null) {
  if (!value) return null;
  const touched = new Date(value);
  const today = new Date(`${localDate()}T00:00:00`);
  const day = new Date(touched.getFullYear(), touched.getMonth(), touched.getDate());
  return Math.max(0, Math.floor((today.getTime() - day.getTime()) / 86400000));
}

function connectionLabel(value: string | null) {
  const days = daysSince(value);
  if (days == null) return { label: "未接続", tone: "none" };
  if (days === 0) return { label: "今日", tone: "hot" };
  if (days === 1) return { label: "昨日", tone: "warm" };
  return { label: `${days}日前`, tone: days >= 4 ? "cold" : "warm" };
}

function scheduleLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  const day = localDate(date);
  if (day === localDate()) return "今日";
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`;
}

function categoryClass(category: string) {
  return `seed-db-category seed-category-${category.replace(/[^a-z0-9_-]/gi, "-")}`;
}

export default function Seeds() {
  const [seeds, setSeeds] = useState<SeedTask[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [collapsedTodos, setCollapsedTodos] = useState<Set<number>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [customSections, setCustomSections] = useState<SectionMap>(() => storageJson("seed-sections", {}));
  const [hiddenSections, setHiddenSections] = useState<string[]>(() => storageJson("seed-hidden-sections", []));
  const [sectionOrder, setSectionOrder] = useState<SectionMap>(() => storageJson("seed-section-order", {}));
  const [dragging, setDragging] = useState<DragState>(null);
  const [keyword, setKeyword] = useState("");
  const [view, setView] = useState<View>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [openTodoMenu, setOpenTodoMenu] = useState<number | null>(null);
  const [openSectionMenu, setOpenSectionMenu] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = async () => {
    const data = await fetchSeeds();
    setSeeds(data);
    setDrafts(Object.fromEntries(data.map((seed) => [seed.id, toPayload(seed)])));
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...seeds.map((seed) => (drafts[seed.id] ?? seed).category).filter(Boolean),
  ])), [drafts, seeds]);

  const sectionsByCategory = useMemo(() => {
    const result: SectionMap = {};
    categories.forEach((category) => {
      const fromSeeds = seeds
        .map((seed) => drafts[seed.id] ?? toPayload(seed))
        .filter((seed) => seed.category === category)
        .map((seed) => normalizeSection(seed.section));
      const defaults = (DEFAULT_SECTIONS[category] ?? []).filter((section) => !hiddenSections.includes(`${category}:${section}`));
      const raw = Array.from(new Set([UNCATEGORIZED, ...defaults, ...(customSections[category] ?? []), ...fromSeeds]));
      const order = sectionOrder[category] ?? [];
      result[category] = [...order.filter((section) => raw.includes(section)), ...raw.filter((section) => !order.includes(section))];
    });
    return result;
  }, [categories, customSections, drafts, hiddenSections, sectionOrder, seeds]);

  const visibleSeeds = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return seeds.filter((seed) => {
      const draft = drafts[seed.id] ?? toPayload(seed);
      if (view === "today" && !seed.scheduled_for?.startsWith(localDate())) return false;
      if (view === "cold" && (daysSince(seed.last_connected_at) ?? 999) < 4) return false;
      if (!q) return true;
      return [draft.title, draft.description, draft.notes, draft.section, draft.category].join(" ").toLowerCase().includes(q);
    });
  }, [drafts, keyword, seeds, view]);

  const childrenByParent = useMemo(() => {
    const map = new Map<number, SeedTask[]>();
    visibleSeeds.forEach((seed) => {
      const parentId = (drafts[seed.id] ?? toPayload(seed)).parent_id;
      if (parentId != null) map.set(parentId, [...(map.get(parentId) ?? []), seed]);
    });
    map.forEach((items) => items.sort((a, b) => (drafts[a.id].sort_order - drafts[b.id].sort_order) || a.id - b.id));
    return map;
  }, [drafts, visibleSeeds]);

  const selectedSeed = seeds.find((seed) => seed.id === selectedId) ?? null;
  const selectedDraft = selectedSeed ? drafts[selectedSeed.id] : null;
  const nextOrder = () => Math.max(0, ...seeds.map((seed) => drafts[seed.id]?.sort_order ?? seed.sort_order)) + 10;

  const updateDraft = (id: number, patch: Partial<SeedPayload>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const save = async (seed: SeedTask) => {
    const draft = drafts[seed.id];
    if (!draft?.title.trim()) return;
    setSavingId(seed.id);
    try {
      const saved = await updateSeed(seed.id, draft);
      setSeeds((current) => current.map((item) => item.id === seed.id ? { ...saved, last_connected_at: item.last_connected_at, scheduled_for: item.scheduled_for } : item));
      setDrafts((current) => ({ ...current, [seed.id]: toPayload(saved) }));
    } finally { setSavingId(null); }
  };

  const addSection = (category: string) => {
    const name = window.prompt(`${scheduleCategoryLabel(category)} に追加する小カテゴリ名`);
    if (!name?.trim()) return;
    const next = { ...customSections, [category]: Array.from(new Set([...(customSections[category] ?? []), name.trim()])) };
    setCustomSections(next);
    localStorage.setItem("seed-sections", JSON.stringify(next));
  };

  const deleteSection = async (category: string, section: string) => {
    if (section === UNCATEGORIZED) return;
    const affected = seeds.filter((seed) => {
      const draft = drafts[seed.id] ?? toPayload(seed);
      return draft.category === category && normalizeSection(draft.section) === section;
    });
    await Promise.all(affected.map((seed) => updateSeed(seed.id, { ...drafts[seed.id], section: UNCATEGORIZED })));
    const nextHidden = Array.from(new Set([...hiddenSections, `${category}:${section}`]));
    setHiddenSections(nextHidden);
    localStorage.setItem("seed-hidden-sections", JSON.stringify(nextHidden));
    setOpenSectionMenu(null);
    await load();
  };

  const submitInlineTodo = async (category: string, section: string, parent?: SeedTask) => {
    if (!newTitle.trim()) return;
    const created = await createSeed(newPayload(category, section, nextOrder(), newTitle.trim(), parent));
    setSeeds((current) => [...current, created]);
    setDrafts((current) => ({ ...current, [created.id]: toPayload(created) }));
    setNewTitle("");
    setAddingTo(null);
    setOpenTodoMenu(null);
  };

  const duplicate = async (seed: SeedTask) => {
    const draft = drafts[seed.id];
    const created = await createSeed({ ...draft, title: `${draft.title}（複製）`, parent_id: null, depth: 0, sort_order: nextOrder(), status: "active" });
    setSeeds((current) => [...current, created]);
    setDrafts((current) => ({ ...current, [created.id]: toPayload(created) }));
    setOpenTodoMenu(null);
  };

  const complete = async (seed: SeedTask) => {
    const draft = drafts[seed.id];
    const saved = await completeSeed(seed.id, draft.actual_minutes || draft.estimated_minutes);
    setSeeds((current) => current.map((item) => item.id === seed.id ? { ...saved, last_connected_at: new Date().toISOString(), scheduled_for: item.scheduled_for } : item));
    setDrafts((current) => ({ ...current, [seed.id]: toPayload(saved) }));
    setOpenTodoMenu(null);
  };

  const plantToday = async (seed: SeedTask) => {
    await plantSeed(seed.id);
    setOpenTodoMenu(null);
    await load();
  };

  const remove = async (seed: SeedTask) => {
    if (!window.confirm(`「${seed.title}」を削除しますか？`)) return;
    await deleteSeed(seed.id);
    setSeeds((current) => current.filter((item) => item.id !== seed.id));
    if (selectedId === seed.id) setSelectedId(null);
    setOpenTodoMenu(null);
  };

  const toggleSet = (setter: Dispatch<SetStateAction<Set<number>>>, id: number) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const moveSection = (category: string, target: string) => {
    if (!dragging || dragging.type !== "section" || dragging.category !== category || dragging.section === target) return;
    const list = sectionsByCategory[category];
    const next = list.filter((item) => item !== dragging.section);
    next.splice(next.indexOf(target), 0, dragging.section);
    const map = { ...sectionOrder, [category]: next };
    setSectionOrder(map);
    localStorage.setItem("seed-section-order", JSON.stringify(map));
    setDragging(null);
  };

  const moveTodo = async (target: SeedTask) => {
    if (!dragging || dragging.type !== "todo" || dragging.id === target.id) return;
    const dragged = seeds.find((seed) => seed.id === dragging.id);
    if (!dragged) return;
    const a = drafts[dragged.id];
    const b = drafts[target.id];
    if (a.parent_id !== b.parent_id || a.category !== b.category || normalizeSection(a.section) !== normalizeSection(b.section)) return;
    const siblings = seeds.filter((seed) => {
      const draft = drafts[seed.id];
      return draft.parent_id === b.parent_id && draft.category === b.category && normalizeSection(draft.section) === normalizeSection(b.section);
    }).sort((x, y) => drafts[x.id].sort_order - drafts[y.id].sort_order);
    const reordered = siblings.filter((seed) => seed.id !== dragged.id);
    reordered.splice(reordered.findIndex((seed) => seed.id === target.id), 0, dragged);
    await Promise.all(reordered.map((seed, index) => updateSeed(seed.id, { ...drafts[seed.id], sort_order: (index + 1) * 10 })));
    setDragging(null);
    await load();
  };

  const renderTodo = (seed: SeedTask): JSX.Element[] => {
    const draft = drafts[seed.id];
    const children = childrenByParent.get(seed.id) ?? [];
    const collapsed = collapsedTodos.has(seed.id);
    const connection = connectionLabel(seed.last_connected_at);
    const isChild = draft.parent_id != null;
    return [
      <div
        className={`seed-db-row ${isChild ? "is-child" : ""} ${draft.status === "done" ? "is-done" : ""}`}
        key={seed.id}
        draggable
        onDragStart={() => setDragging({ type: "todo", id: seed.id })}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => moveTodo(seed)}
      >
        <span className="seed-db-id">{draft.priority || `${isChild ? "└ " : ""}${seed.id}`}</span>
        <div className="seed-db-title" style={{ paddingLeft: draft.depth * 20 }}>
          <button type="button" className="seed-tree-toggle" disabled={!children.length} onClick={() => toggleSet(setCollapsedTodos, seed.id)}>
            {children.length ? (collapsed ? "▸" : "▾") : isChild ? "└" : ""}
          </button>
          <button type="button" className="seed-title-button" onClick={() => setSelectedId(seed.id)}>
            <strong>{draft.title}</strong>
            {draft.description && <small>{draft.description}</small>}
          </button>
        </div>
        <span className={`seed-connection ${connection.tone}`} title={seed.last_connected_at ? `最終接続：${new Date(seed.last_connected_at).toLocaleString("ja-JP")}` : "接続記録なし"}>
          <i />{connection.label}
        </span>
        <span className={`seed-schedule ${seed.scheduled_for?.startsWith(localDate()) ? "today" : ""}`}>{scheduleLabel(seed.scheduled_for)}</span>
        <div className="seed-row-menu">
          <button type="button" aria-label="Todoの操作" title="操作" onClick={() => setOpenTodoMenu(openTodoMenu === seed.id ? null : seed.id)}>⋮</button>
          {openTodoMenu === seed.id && (
            <div className="seed-popover-menu">
              <button type="button" onClick={() => plantToday(seed)}>今日の予定に入れる</button>
              <button type="button" onClick={() => { setAddingTo(`child:${seed.id}`); setNewTitle(""); }}>子Todoを追加</button>
              <button type="button" onClick={() => duplicate(seed)}>複製</button>
              <button type="button" onClick={() => setSelectedId(seed.id)}>移動・編集</button>
              <button type="button" onClick={() => complete(seed)} disabled={draft.status === "done"}>完了にする</button>
              <button type="button" className="danger" onClick={() => remove(seed)}>削除</button>
            </div>
          )}
        </div>
      </div>,
      ...(addingTo === `child:${seed.id}` ? [
        <form className="seed-inline-add child" key={`add-${seed.id}`} onSubmit={(event) => { event.preventDefault(); submitInlineTodo(draft.category, normalizeSection(draft.section), seed); }}>
          <span>└</span><input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="子Todo名を入力" />
          <button type="submit">追加</button><button type="button" onClick={() => setAddingTo(null)}>取消</button>
        </form>,
      ] : []),
      ...(!collapsed ? children.flatMap(renderTodo) : []),
    ];
  };

  return (
    <main className="seeds-page seed-db-page">
      <header className="seed-db-head">
        <div><p>種リスト</p><h1>Todo</h1></div>
        <span>{seeds.length}件</span>
      </header>

      <div className="seed-db-toolbar">
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Todoを検索…" />
        <div className="seed-view-tabs">
          <button className={view === "all" ? "active" : ""} onClick={() => setView("all")}>すべて</button>
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>今日</button>
          <button className={view === "cold" ? "active" : ""} onClick={() => setView("cold")}>接続が冷えた</button>
        </div>
      </div>

      <div className="seed-db-stack">
        {categories.map((category) => {
          const categoryCount = visibleSeeds.filter((seed) => drafts[seed.id].category === category).length;
          return (
            <section className={categoryClass(category)} key={category}>
              <header className="seed-category-heading">
                <div><span /><h2>{scheduleCategoryLabel(category)}</h2><small>{categoryCount}件</small></div>
                <button type="button" title="小カテゴリを追加" aria-label="小カテゴリを追加" onClick={() => addSection(category)}>＋</button>
              </header>
              {(sectionsByCategory[category] ?? []).map((section) => {
                const sectionKey = `${category}:${section}`;
                const roots = visibleSeeds.filter((seed) => {
                  const draft = drafts[seed.id];
                  return draft.category === category && normalizeSection(draft.section) === section && draft.parent_id == null;
                }).sort((a, b) => drafts[a.id].sort_order - drafts[b.id].sort_order || a.id - b.id);
                const collapsed = collapsedSections.has(sectionKey);
                return (
                  <article className="seed-db-section" key={sectionKey} draggable onDragStart={() => setDragging({ type: "section", category, section })} onDragOver={(event) => event.preventDefault()} onDrop={() => moveSection(category, section)}>
                    <div className="seed-section-heading">
                      <button type="button" onClick={() => setCollapsedSections((current) => {
                        const next = new Set(current); if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey); return next;
                      })}>{collapsed ? "▸" : "▾"}</button>
                      <strong>{section}</strong><small>{roots.length}件</small>
                      <div>
                        <button type="button" title="Todoを追加" aria-label="Todoを追加" onClick={() => { setAddingTo(sectionKey); setNewTitle(""); }}>＋</button>
                        <button type="button" title="小カテゴリの操作" aria-label="小カテゴリの操作" onClick={() => setOpenSectionMenu(openSectionMenu === sectionKey ? null : sectionKey)}>⋮</button>
                        {openSectionMenu === sectionKey && (
                          <div className="seed-popover-menu section">
                            <button type="button" onClick={() => { setAddingTo(sectionKey); setNewTitle(""); setOpenSectionMenu(null); }}>Todoを追加</button>
                            <button type="button" className="danger" disabled={section === UNCATEGORIZED} onClick={() => deleteSection(category, section)}>小カテゴリを削除</button>
                          </div>
                        )}
                      </div>
                    </div>
                    {!collapsed && (
                      <div className="seed-db-grid">
                        <div className="seed-db-columns"><span>ID</span><span>Todo</span><span>接続</span><span>予定</span><span /></div>
                        {roots.flatMap(renderTodo)}
                        {addingTo === sectionKey ? (
                          <form className="seed-inline-add" onSubmit={(event) => { event.preventDefault(); submitInlineTodo(category, section); }}>
                            <span>＋</span><input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Todo名を入力…" />
                            <button type="submit">追加</button><button type="button" onClick={() => setAddingTo(null)}>取消</button>
                          </form>
                        ) : (
                          <button className="seed-add-row" type="button" onClick={() => { setAddingTo(sectionKey); setNewTitle(""); }}>＋ Todoを追加</button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      {selectedSeed && selectedDraft && (
        <>
          <button className="seed-drawer-backdrop" type="button" aria-label="詳細を閉じる" onClick={() => setSelectedId(null)} />
          <aside className="seed-detail-drawer" aria-label="Todo詳細">
            <header><div><span>Todo詳細</span><small>#{selectedSeed.id}</small></div><button type="button" onClick={() => setSelectedId(null)}>×</button></header>
            <label>Todo<input value={selectedDraft.title} onChange={(event) => updateDraft(selectedSeed.id, { title: event.target.value })} /></label>
            <label>補足<textarea rows={2} value={selectedDraft.description ?? ""} onChange={(event) => updateDraft(selectedSeed.id, { description: event.target.value })} placeholder="一覧に表示する短い補足" /></label>
            <div className="seed-detail-split">
              <label>カテゴリ<select value={selectedDraft.category} onChange={(event) => updateDraft(selectedSeed.id, { category: event.target.value, section: UNCATEGORIZED })}>{categories.map((category) => <option value={category} key={category}>{scheduleCategoryLabel(category)}</option>)}</select></label>
              <label>小カテゴリ<select value={normalizeSection(selectedDraft.section)} onChange={(event) => updateDraft(selectedSeed.id, { section: event.target.value })}>{(sectionsByCategory[selectedDraft.category] ?? [UNCATEGORIZED]).map((section) => <option value={section} key={section}>{section}</option>)}</select></label>
            </div>
            <div className="seed-detail-meta">
              <span>最終接続<strong>{connectionLabel(selectedSeed.last_connected_at).label}</strong></span>
              <span>予定<strong>{scheduleLabel(selectedSeed.scheduled_for)}</strong></span>
            </div>
            <label>備考・悩み<textarea rows={9} value={selectedDraft.notes ?? ""} onChange={(event) => updateDraft(selectedSeed.id, { notes: event.target.value })} placeholder="なぜやるか、悩み、モチベーション源、手順など" /></label>
            <footer>
              <span>{savingId === selectedSeed.id ? "保存中…" : ""}</span>
              <div>
                <button type="button" className="secondary" onClick={() => plantToday(selectedSeed)}>今日の予定に入れる</button>
                <button type="button" onClick={() => save(selectedSeed)}>変更を保存</button>
              </div>
            </footer>
          </aside>
        </>
      )}
    </main>
  );
}
