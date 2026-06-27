import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createLog, DailyLogCreate } from "../api/client";
import QuickLog from "../components/QuickLog";
import "./LogForm.css";

const today = () => new Date().toISOString().slice(0, 10);

export default function LogForm() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<DailyLogCreate>({
    date: today(),
    sleep_hours: 7,
    overtime_hours: 0,
    mood_score: 3,
    did_workout: false,
    did_create: false,
    did_code: false,
    drank_alcohol: false,
    memo: "",
  });

  const set = (key: keyof DailyLogCreate, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await createLog(form);
      navigate("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="log-form-page">
      <h1 className="page-title">今日のログを登録</h1>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <QuickLog onRegistered={() => navigate("/")} />
      </div>

      <div className="form-divider">
        <span>または手動で入力</span>
      </div>

      <form className="card log-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>日付</label>
          <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />
        </div>

        <div className="form-row">
          <label>睡眠時間 <span className="val">{form.sleep_hours}h</span></label>
          <input type="range" min={0} max={12} step={0.5} value={form.sleep_hours}
            onChange={(e) => set("sleep_hours", parseFloat(e.target.value))} />
        </div>

        <div className="form-row">
          <label>残業時間 <span className="val">{form.overtime_hours}h</span></label>
          <input type="range" min={0} max={8} step={0.5} value={form.overtime_hours}
            onChange={(e) => set("overtime_hours", parseFloat(e.target.value))} />
        </div>

        <div className="form-row">
          <label>気分スコア</label>
          <div className="mood-selector">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button key={n} type="button"
                className={`mood-btn ${form.mood_score === n ? "active" : ""}`}
                onClick={() => set("mood_score", n)}
              >
                {["😞", "😕", "😐", "🙂", "😄"][n - 1]} {n}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row toggle-row">
          {(
            [
              ["did_workout", "💪 筋トレした"],
              ["did_create", "🎨 創作した"],
              ["did_code", "💻 Web開発した"],
              ["drank_alcohol", "🍺 お酒を飲んだ"],
            ] as [keyof DailyLogCreate, string][]
          ).map(([key, label]) => (
            <label key={key} className={`toggle ${form[key] ? "on" : ""}`}>
              <input type="checkbox" checked={!!form[key]}
                onChange={(e) => set(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>

        <div className="form-row">
          <label>メモ</label>
          <textarea rows={3} value={form.memo} placeholder="今日の出来事、気づきなど..."
            onChange={(e) => set("memo", e.target.value)} />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn-primary submit-btn" disabled={submitting}>
          {submitting ? "登録中..." : "ログを登録する"}
        </button>
      </form>
    </div>
  );
}
