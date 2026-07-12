import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createDream, deleteDream, Dream, DreamPayload, fetchDreams, updateDream } from "../api/dreams";
import { scheduleCategoryLabel } from "../constants/categories";
import "./Dreams.css";

const emptyDream: DreamPayload = {
  title: "",
  category: "creation",
  description: "",
  image_url: "",
  icon: "🌱",
  progress: 0,
};

export default function Dreams() {
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [form, setForm] = useState<DreamPayload>(emptyDream);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => fetchDreams().then(setDreams).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    if (editingId) {
      await updateDream(editingId, form);
    } else {
      await createDream(form);
    }
    setForm(emptyDream);
    setEditingId(null);
    await load();
  };

  const startEdit = (dream: Dream) => {
    setEditingId(dream.id);
    setForm({
      title: dream.title,
      category: dream.category,
      description: dream.description ?? "",
      image_url: dream.image_url ?? "",
      icon: dream.icon ?? "🌱",
      progress: dream.progress,
    });
  };

  const remove = async (id: number) => {
    await deleteDream(id);
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyDream);
    }
    await load();
  };

  return (
    <div className="dreams-page">
      <section className="dreams-hero">
        <div>
          <p>夢ページ</p>
          <h1>夢を、今日の30分に変える</h1>
          <span>Todoを大量に見る前に、まず「何のために耕すのか」を思い出す場所です。</span>
        </div>
        <Link className="dreams-seed-link" to="/seeds">種リストへ</Link>
      </section>

      <section className="dream-grid">
        {loading ? <p className="dream-muted">読み込み中...</p> : dreams.map((dream) => (
          <article className={`dream-card ${dream.category}`} key={dream.id}>
            <Link to={`/dreams/${dream.id}`} className="dream-card-main">
              <div className="dream-visual">
                {dream.image_url ? <img src={dream.image_url} alt="" /> : <span>{dream.icon || "🌱"}</span>}
              </div>
              <div className="dream-card-body">
                <span className="dream-category">{scheduleCategoryLabel(dream.category)}</span>
                <h2>{dream.title}</h2>
                <p>{dream.description || "この夢の説明を追加できます。"}</p>
              </div>
              <div className="dream-progress">
                <div><span style={{ width: `${Math.min(100, Math.max(0, dream.progress))}%` }} /></div>
                <strong>{dream.progress}%</strong>
              </div>
            </Link>
            <div className="dream-card-actions">
              <button type="button" onClick={() => startEdit(dream)}>編集</button>
              <button type="button" onClick={() => remove(dream.id)}>削除</button>
            </div>
          </article>
        ))}
      </section>

      <form className="dream-form" onSubmit={submit}>
        <p>{editingId ? "夢を編集" : "夢を追加"}</p>
        <label>
          タイトル
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
        <label>
          カテゴリ
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {(["creation", "social", "job_search", "workout"] as const).map((category) => (
              <option value={category} key={category}>{scheduleCategoryLabel(category)}</option>
            ))}
          </select>
        </label>
        <label>
          アイコン
          <input value={form.icon ?? ""} onChange={(event) => setForm({ ...form, icon: event.target.value })} />
        </label>
        <label>
          進捗
          <input type="number" min="0" max="100" value={form.progress} onChange={(event) => setForm({ ...form, progress: Number(event.target.value) })} />
        </label>
        <label className="wide">
          説明
          <textarea value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <label className="wide">
          画像URL
          <input value={form.image_url ?? ""} onChange={(event) => setForm({ ...form, image_url: event.target.value })} />
        </label>
        <div className="dream-form-actions">
          <button>{editingId ? "保存" : "追加"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyDream); }}>解除</button>}
        </div>
      </form>
    </div>
  );
}
