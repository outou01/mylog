import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createLog, updateLog, fetchLog, DailyLog } from "../api/client";
import QuickLog from "../components/QuickLog";
import "./LogForm.css";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const EMPTY_FORM = {
  date: todayStr(),
  sleep_hours: 7,
  overtime_hours: 0,
  mood_score: 3,
  did_workout: false,
  did_create: false,
  did_code: false,
  did_job_search: false,
  did_study: false,
  drank_alcohol: false,
  energy_level: 2,
  day_type: "advance",
  went_outside: false,
  ate_good_food: false,
  took_walk: false,
  visited_cafe: false,
  visited_akihabara: false,
  napped: false,
  played_games: false,
  talked_with_friends: false,
  did_nothing: false,
  discharge_activities: "",
  memo: "",
  create_hours: 0,
  workout_hours: 0,
  study_hours: 0,
  code_hours: 0,
  job_search_hours: 0,
};

type FormState = typeof EMPTY_FORM;

const PROGRESS_ITEMS: [keyof FormState, string][] = [
  ["did_workout", "💪 筋トレ"],
  ["did_create", "🎨 創作"],
  ["did_code", "💻 開発"],
  ["did_job_search", "💼 転職活動"],
  ["did_study", "📚 勉強"],
];

const RECOVERY_ITEMS: [keyof FormState, string][] = [
  ["went_outside", "🌞 外出した"],
  ["ate_good_food", "🍜 美味しいもの食べた"],
  ["took_walk", "🚶 散歩した"],
  ["visited_cafe", "☕ カフェ行った"],
  ["visited_akihabara", "🏙 秋葉原行った"],
  ["napped", "😴 昼寝した"],
  ["played_games", "🎮 ゲームした"],
  ["talked_with_friends", "💬 友人と話した"],
  ["did_nothing", "☁ 何もしなかった"],
];

export default function LogForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const editId = id ? parseInt(id, 10) : null;

  const [submitting, setSubmitting] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (!editId) return;
    fetchLog(editId)
      .then((log: DailyLog) => {
        setForm({
          date: log.date,
          sleep_hours: log.sleep_hours,
          overtime_hours: log.overtime_hours,
          mood_score: log.mood_score,
          did_workout: log.did_workout,
          did_create: log.did_create,
          did_code: log.did_code,
          did_job_search: log.did_job_search ?? false,
          did_study: log.did_study ?? false,
          drank_alcohol: log.drank_alcohol,
          energy_level: log.energy_level ?? 2,
          day_type: log.day_type ?? "advance",
          went_outside: log.went_outside ?? false,
          ate_good_food: log.ate_good_food ?? false,
          took_walk: log.took_walk ?? false,
          visited_cafe: log.visited_cafe ?? false,
          visited_akihabara: log.visited_akihabara ?? false,
          napped: log.napped ?? false,
          played_games: log.played_games ?? false,
          talked_with_friends: log.talked_with_friends ?? false,
          did_nothing: log.did_nothing ?? false,
          discharge_activities: log.discharge_activities ?? "",
          memo: log.memo ?? "",
          create_hours: log.create_hours ?? 0,
          workout_hours: log.workout_hours ?? 0,
          study_hours: log.study_hours ?? 0,
          code_hours: log.code_hours ?? 0,
          job_search_hours: log.job_search_hours ?? 0,
        });
      })
      .catch(() => setError("ログの読み込みに失敗しました"))
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (editId) {
        await updateLog(editId, form);
      } else {
        await createLog(form);
      }
      navigate("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingEdit) return <div className="loading">Loading...</div>;

  return (
    <div className="log-form-page">
      <h1 className="page-title">{editId ? "ログを修正" : "今日のログを登録"}</h1>

      {!editId && (
        <>
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <QuickLog onRegistered={() => navigate("/")} />
          </div>
          <div className="form-divider"><span>または手動で入力</span></div>
        </>
      )}

      <form className="card log-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>日付</label>
          <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required disabled={!!editId} />
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

        <div className="form-row">
          <label>エネルギー</label>
          <div className="mood-selector">
            {([1, 2, 3] as const).map((n) => (
              <button key={n} type="button"
                className={`mood-btn ${form.energy_level === n ? "active" : ""}`}
                onClick={() => set("energy_level", n)}
              >
                {["😩 疲れた", "😐 普通", "😊 元気"][n - 1]}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label>今日の目的</label>
          <div className="mood-selector">
            {[
              ["advance", "⚔ 前進"],
              ["recovery", "🛌 回復"],
              ["maintenance", "🔧 メンテ"],
            ].map(([v, l]) => (
              <button key={v} type="button"
                className={`mood-btn ${form.day_type === v ? "active" : ""}`}
                onClick={() => set("day_type", v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label style={{ color: "var(--accent)", fontSize: "0.8rem" }}>⚔ 前進クエスト（時間）</label>
          {[
            ["create_hours", "🎨 創作"],
            ["workout_hours", "💪 筋トレ"],
            ["code_hours", "💻 開発"],
            ["study_hours", "📚 勉強"],
            ["job_search_hours", "💼 転職活動"],
          ].map(([key, label]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.4rem 0" }}>
              <span style={{ width: "110px", fontSize: "0.88rem" }}>{label}</span>
              <input type="range" min={0} max={4} step={0.5}
                value={(form as unknown as Record<string, number>)[key] ?? 0}
                onChange={(e) => set(key as keyof FormState, parseFloat(e.target.value) as FormState[keyof FormState])}
                style={{ flex: 1 }} />
              <span className="val" style={{ width: "30px" }}>{(form as unknown as Record<string, number>)[key] ?? 0}h</span>
            </div>
          ))}
        </div>

        <div className="form-row toggle-row">
          <label style={{ width: "100%", color: "var(--green)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>🛌 回復ポイント</label>
          {RECOVERY_ITEMS.map(([key, label]) => (
            <label key={key} className={`toggle ${form[key] ? "on" : ""}`}>
              <input type="checkbox" checked={!!form[key]}
                onChange={(e) => set(key, e.target.checked as FormState[typeof key])} />
              {label}
            </label>
          ))}
        </div>

        <div className="form-row toggle-row">
          <label className={`toggle ${form.drank_alcohol ? "on" : ""}`}>
            <input type="checkbox" checked={form.drank_alcohol}
              onChange={(e) => set("drank_alcohol", e.target.checked)} />
            🍺 お酒を飲んだ
          </label>
        </div>

        <div className="form-row">
          <label>発散（なんでも記録）</label>
          <textarea rows={2} value={form.discharge_activities} placeholder="ゲーム、YouTube、パチンコ..."
            onChange={(e) => set("discharge_activities", e.target.value)} />
        </div>

        <div className="form-row">
          <label>メモ</label>
          <textarea rows={3} value={form.memo} placeholder="今日の出来事、気づきなど..."
            onChange={(e) => set("memo", e.target.value)} />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn-primary submit-btn" disabled={submitting}>
          {submitting ? (editId ? "更新中..." : "登録中...") : (editId ? "ログを更新する" : "ログを登録する")}
        </button>
      </form>
    </div>
  );
}
