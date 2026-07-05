import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSeed, deleteSeed, Dream, fetchDreams, fetchSeeds, plantSeed, SeedPayload, SeedTask, updateSeed } from "../api/dreams";
import "./Dreams.css";

const CATEGORY_LABEL: Record<string, string> = {
  creation: "創作",
  social: "交流",
  job_search: "転職活動",
  workout: "筋トレ",
};

const emptySeed: SeedPayload = {
  title: "",
  category: "creation",
  dream_id: null,
  project_id: null,
  section: "シナリオ",
  description: "",
  purpose: "",
  estimated_minutes: 30,
  status: "active",
  notes: "",
};

export default function Seeds() {
  const [seeds, setSeeds] = useState<SeedTask[]>([]);
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [form, setForm] = useState<SeedPayload>(emptySeed);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [plantingId, setPlantingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    const [seedData, dreamData] = await Promise.all([fetchSeeds(), fetchDreams()]);
    setSeeds(seedData);
    setDreams(dreamData);
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, SeedTask[]>();
    seeds.forEach((seed) => {
      const key = `${CATEGORY_LABEL[seed.category] ?? seed.category} / ${seed.section || "未分類"}`;
      map.set(key, [...(map.get(key) ?? []), seed]);
    });
    return Array.from(map.entries());
  }, [seeds]);

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
      section: seed.section,
      description: seed.description,
      purpose: seed.purpose,
      estimated_minutes: seed.estimated_minutes,
      status: seed.status,
      notes: seed.notes,
    });
  };

  const plant = async (seed: SeedTask) => {
    setPlantingId(seed.id);
    try {
      const planted = await plantSeed(seed.id);
      setMessage(`${seed.title} を ${planted.start_time}-${planted.end_time} に植えました。`);
    } finally {
      setPlantingId(null);
    }
  };

  const remove = async (id: number) => {
    await deleteSeed(id);
    if (editingId === id) {
      setEditingId(null);
      setForm(emptySeed);
    }
    await load();
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

  return (
    <div className="seeds-page">
      <section className="dreams-hero">
        <div>
          <p>種リスト</p>
          <h1>夢を、今日やる行動に分ける</h1>
          <span>「なぜやるか」「どうやるか」まで残して、カレンダーへ一手で植えます。</span>
        </div>
      </section>

      {message && <div className="plant-message">{message}</div>}

      <section className="seed-list">
        {grouped.map(([group, items]) => (
          <article className="seed-group" key={group}>
            <h2>{group}</h2>
            {items.map((seed) => (
              <div className="seed-card" key={seed.id}>
                <div>
                  <strong>{seed.title}</strong>
                  <p>{seed.purpose || "目的を追加できます。"}</p>
                  {seed.description && <span>{seed.description}</span>}
                </div>
                <div className="seed-actions">
                  <button type="button" onClick={() => plant(seed)} disabled={plantingId === seed.id}>
                    {plantingId === seed.id ? "植えています..." : `今日植える ${seed.estimated_minutes}分`}
                  </button>
                  <button type="button" onClick={() => startEdit(seed)}>編集</button>
                  <button type="button" onClick={() => remove(seed.id)}>削除</button>
                </div>
              </div>
            ))}
          </article>
        ))}
      </section>

      <form className="seed-form" onSubmit={submit}>
        <p>{editingId ? "種を編集" : "種を追加"}</p>
        <label>
          タイトル
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
        <label>
          夢
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
          推定分
          <input type="number" min="5" max="480" value={form.estimated_minutes} onChange={(event) => setForm({ ...form, estimated_minutes: Number(event.target.value) })} />
        </label>
        <label>
          状態
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="active">実行中</option>
            <option value="done">完了</option>
            <option value="paused">保留</option>
          </select>
        </label>
        <label className="wide">
          目的
          <textarea value={form.purpose ?? ""} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
        </label>
        <label className="wide">
          どうやるか / メモ
          <textarea value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <div className="dream-form-actions">
          <button>{editingId ? "保存" : "追加"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptySeed); }}>解除</button>}
        </div>
      </form>
    </div>
  );
}
