import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
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

const emptySeed: SeedPayload = {
  title: "",
  category: "creation",
  dream_id: null,
  project_id: null,
  priority: "",
  section: "シナリオ",
  description: "",
  purpose: "",
  concern: "",
  motivation: "",
  estimated_minutes: 30,
  actual_minutes: null,
  status: "active",
  notes: "",
};

function statusClass(status: string) {
  return `seed-status ${status}`;
}

export default function Seeds() {
  const [seeds, setSeeds] = useState<SeedTask[]>([]);
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [form, setForm] = useState<SeedPayload>(emptySeed);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [plantingId, setPlantingId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [durationFilter, setDurationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");

  const load = async () => {
    const [seedData, dreamData] = await Promise.all([fetchSeeds(), fetchDreams()]);
    setSeeds(seedData);
    setDreams(dreamData);
  };

  useEffect(() => {
    load();
  }, []);

  const dreamById = useMemo(() => new Map(dreams.map((dream) => [dream.id, dream])), [dreams]);

  const filteredSeeds = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return seeds.filter((seed) => {
      if (tab === "active" && !["active", "planted", "in_progress", "paused"].includes(seed.status)) return false;
      if (tab === "candidates" && seed.status !== "active") return false;
      if (tab === "done" && seed.status !== "done") return false;
      if (tab === "archived" && seed.status !== "archived") return false;
      if (categoryFilter && seed.category !== categoryFilter) return false;
      if (projectFilter && String(seed.project_id ?? "") !== projectFilter) return false;
      if (statusFilter && seed.status !== statusFilter) return false;
      if (durationFilter === "short" && seed.estimated_minutes > 30) return false;
      if (durationFilter === "medium" && (seed.estimated_minutes <= 30 || seed.estimated_minutes > 60)) return false;
      if (durationFilter === "long" && seed.estimated_minutes <= 60) return false;
      if (!q) return true;
      const target = [
        seed.priority,
        seed.title,
        seed.section,
        seed.description,
        seed.purpose,
        seed.concern,
        seed.motivation,
        seed.notes,
        dreamById.get(seed.dream_id ?? -1)?.title,
      ].join(" ").toLowerCase();
      return target.includes(q);
    });
  }, [categoryFilter, dreamById, durationFilter, keyword, projectFilter, seeds, statusFilter, tab]);

  const grouped = useMemo(() => {
    const map = new Map<string, SeedTask[]>();
    filteredSeeds.forEach((seed) => {
      const key = `${CATEGORY_LABEL[seed.category] ?? seed.category} / ${seed.section || "未分類"}`;
      map.set(key, [...(map.get(key) ?? []), seed]);
    });
    return Array.from(map.entries());
  }, [filteredSeeds]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    if (editingId) {
      await updateSeed(editingId, form);
    } else {
      await createSeed(form);
    }
    setForm(emptySeed);
    setEditingId(null);
    await load();
  };

  const startEdit = (seed: SeedTask) => {
    setEditingId(seed.id);
    setForm({
      title: seed.title,
      category: seed.category,
      dream_id: seed.dream_id,
      project_id: seed.project_id,
      priority: seed.priority,
      section: seed.section,
      description: seed.description,
      purpose: seed.purpose,
      concern: seed.concern,
      motivation: seed.motivation,
      estimated_minutes: seed.estimated_minutes,
      actual_minutes: seed.actual_minutes,
      status: seed.status,
      notes: seed.notes,
    });
  };

  const plant = async (seed: SeedTask) => {
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
    await completeSeed(seed.id, seed.actual_minutes || seed.estimated_minutes);
    setMessage(`${seed.title} を完了にしました。`);
    await load();
  };

  const archive = async (seed: SeedTask) => {
    await updateSeed(seed.id, { ...toPayload(seed), status: "archived" });
    await load();
  };

  const remove = async (id: number) => {
    await deleteSeed(id);
    if (editingId === id) {
      setEditingId(null);
      setForm(emptySeed);
    }
    await load();
  };

  const toggleDetail = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chooseDream = (dreamIdText: string) => {
    const dreamId = dreamIdText ? Number(dreamIdText) : null;
    const dream = dreams.find((item) => item.id === dreamId);
    setForm({
      ...form,
      dream_id: dreamId,
      project_id: dream?.linked_project_id ?? null,
      category: dream?.category ?? form.category,
    });
  };

  const projectOptions = dreams
    .filter((dream) => dream.linked_project_id != null)
    .map((dream) => ({ id: dream.linked_project_id as number, label: dream.title }));

  return (
    <div className="seeds-page table-mode">
      <section className="seed-workbench-head">
        <div>
          <p>種リスト</p>
          <h1>今日やる候補を探して、カレンダーに植える</h1>
          <span>ExcelのTodoシートに近い、一覧性重視の作業台です。</span>
        </div>
      </section>

      {message && <div className="plant-message">{message}</div>}

      <section className="seed-toolbar">
        <div className="seed-tabs">
          {TABS.map((item) => (
            <button key={item.key} type="button" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="seed-filters">
          <input placeholder="キーワード" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
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
          <select value={durationFilter} onChange={(event) => setDurationFilter(event.target.value)}>
            <option value="">所要時間すべて</option>
            <option value="short">30分以内</option>
            <option value="medium">31-60分</option>
            <option value="long">61分以上</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">状態すべて</option>
            <option value="active">未着手</option>
            <option value="planted">今日植えた</option>
            <option value="in_progress">進行中</option>
            <option value="done">完了</option>
            <option value="archived">アーカイブ</option>
          </select>
        </div>
      </section>

      <section className="seed-table-stack">
        {grouped.map(([group, items]) => (
          <article className="seed-table-group" key={group}>
            <h2>{group}</h2>
            <div className="seed-table-wrap">
              <table className="seed-table">
                <thead>
                  <tr>
                    <th>優先度</th>
                    <th>カテゴリ</th>
                    <th>プロジェクト</th>
                    <th>タスク名</th>
                    <th>内容</th>
                    <th>所要</th>
                    <th>備考</th>
                    <th>状態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((seed) => {
                    const dream = dreamById.get(seed.dream_id ?? -1);
                    return (
                      <Fragment key={seed.id}>
                        <tr>
                          <td className="seed-priority">{seed.priority || "-"}</td>
                          <td>{CATEGORY_LABEL[seed.category] ?? seed.category}</td>
                          <td>{dream?.title || (seed.project_id ? `#${seed.project_id}` : "-")}</td>
                          <td className="seed-title-cell">{seed.title}</td>
                          <td>{seed.description || seed.purpose || "-"}</td>
                          <td>{seed.estimated_minutes}分</td>
                          <td>
                            <button className="seed-link-btn" type="button" onClick={() => toggleDetail(seed.id)}>
                              {expanded.has(seed.id) ? "閉じる" : "詳細"}
                            </button>
                          </td>
                          <td><span className={statusClass(seed.status)}>{STATUS_LABEL[seed.status] ?? seed.status}</span></td>
                          <td>
                            <div className="seed-table-actions">
                              <button type="button" onClick={() => plant(seed)} disabled={plantingId === seed.id || seed.status === "done" || seed.status === "archived"}>
                                {plantingId === seed.id ? "植え中" : "今日植える"}
                              </button>
                              <button type="button" onClick={() => startEdit(seed)}>編集</button>
                              <button type="button" onClick={() => complete(seed)} disabled={seed.status === "done"}>完了</button>
                              <button type="button" onClick={() => archive(seed)} disabled={seed.status === "archived"}>アーカイブ</button>
                              <button type="button" onClick={() => remove(seed.id)}>削除</button>
                            </div>
                          </td>
                        </tr>
                        {expanded.has(seed.id) && (
                          <tr className="seed-detail-row">
                            <td colSpan={9}>
                              <div className="seed-detail-grid">
                                <p><strong>なぜやるか</strong><span>{seed.purpose || "-"}</span></p>
                                <p><strong>どうやるか</strong><span>{seed.description || "-"}</span></p>
                                <p><strong>悩み</strong><span>{seed.concern || "-"}</span></p>
                                <p><strong>モチベーション源</strong><span>{seed.motivation || "-"}</span></p>
                                <p><strong>メモ</strong><span>{seed.notes || "-"}</span></p>
                                <p><strong>完了</strong><span>{seed.completed_at ? `${seed.completed_at.slice(0, 10)} / ${seed.actual_minutes ?? seed.estimated_minutes}分` : "-"}</span></p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        ))}
        {!grouped.length && <div className="seed-empty">条件に合う種はありません。</div>}
      </section>

      <form className="seed-form compact" onSubmit={submit}>
        <p>{editingId ? "種を編集" : "種を追加"}</p>
        <label>
          優先度
          <input value={form.priority ?? ""} onChange={(event) => setForm({ ...form, priority: event.target.value })} />
        </label>
        <label>
          タイトル
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
        <label>
          夢 / プロジェクト
          <select value={form.dream_id ?? ""} onChange={(event) => chooseDream(event.target.value)}>
            <option value="">紐づけなし</option>
            {dreams.map((dream) => <option value={dream.id} key={dream.id}>{dream.title}</option>)}
          </select>
        </label>
        <label>
          カテゴリ
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            <option value="creation">創作</option>
            <option value="social">交流</option>
            <option value="job_search">転職活動</option>
            <option value="workout">筋トレ</option>
          </select>
        </label>
        <label>
          セクション
          <input value={form.section ?? ""} onChange={(event) => setForm({ ...form, section: event.target.value })} />
        </label>
        <label>
          所要分
          <input type="number" min="5" max="480" value={form.estimated_minutes} onChange={(event) => setForm({ ...form, estimated_minutes: Number(event.target.value) })} />
        </label>
        <label>
          実績分
          <input type="number" min="0" max="1440" value={form.actual_minutes ?? ""} onChange={(event) => setForm({ ...form, actual_minutes: event.target.value ? Number(event.target.value) : null })} />
        </label>
        <label>
          状態
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="active">未着手</option>
            <option value="planted">今日植えた</option>
            <option value="in_progress">進行中</option>
            <option value="done">完了</option>
            <option value="archived">アーカイブ</option>
          </select>
        </label>
        <label className="wide">
          内容（行動主体）
          <textarea value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <label className="wide">
          なぜやるか
          <textarea value={form.purpose ?? ""} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
        </label>
        <label className="wide">
          悩み
          <textarea value={form.concern ?? ""} onChange={(event) => setForm({ ...form, concern: event.target.value })} />
        </label>
        <label className="wide">
          モチベーション源
          <textarea value={form.motivation ?? ""} onChange={(event) => setForm({ ...form, motivation: event.target.value })} />
        </label>
        <label className="wide">
          メモ
          <textarea value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        <div className="dream-form-actions">
          <button>{editingId ? "保存" : "追加"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptySeed); }}>解除</button>}
        </div>
      </form>
    </div>
  );
}

function toPayload(seed: SeedTask): SeedPayload {
  return {
    title: seed.title,
    category: seed.category,
    dream_id: seed.dream_id,
    project_id: seed.project_id,
    priority: seed.priority,
    section: seed.section,
    description: seed.description,
    purpose: seed.purpose,
    concern: seed.concern,
    motivation: seed.motivation,
    estimated_minutes: seed.estimated_minutes,
    actual_minutes: seed.actual_minutes,
    status: seed.status,
    notes: seed.notes,
  };
}
