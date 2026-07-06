import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  DailyLog,
  fetchSoilAriaComment,
  fetchSoilStatus,
  fetchSoilToday,
  fetchWeeklySoilReport,
  logUsualDay,
  SoilStatus,
  updateLog,
  WeeklySoilReport,
} from "../api/client";
import "./Soil.css";

const SOIL_ICON: Record<string, string> = {
  rich: "🌱", ok: "🌍", dry: "🏜️", unknown: "🌫️",
};

const SLEEP_OPTIONS = [4, 5, 6, 7, 8, 9];
const MOOD_OPTIONS = [
  { value: 1, label: "😞" }, { value: 2, label: "😕" }, { value: 3, label: "😐" },
  { value: 4, label: "🙂" }, { value: 5, label: "😄" },
];
const ENERGY_OPTIONS = [
  { value: 1, label: "😩 疲れた" }, { value: 2, label: "😐 普通" }, { value: 3, label: "😊 元気" },
];

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="soil-bar-row">
      <span className="soil-bar-label">{label}</span>
      <div className="soil-bar-track">
        <div className="soil-bar-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="soil-bar-value">{value}</span>
    </div>
  );
}

export default function Soil() {
  const [status, setStatus] = useState<SoilStatus | null>(null);
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null);
  const [report, setReport] = useState<WeeklySoilReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [justLogged, setJustLogged] = useState(false);
  const [ariaComment, setAriaComment] = useState<string | null>(null);
  const [ariaThinking, setAriaThinking] = useState(false);
  const [ariaFailed, setAriaFailed] = useState(false);
  const lastAriaFetch = useRef(0);

  const load = async () => {
    const [s, t] = await Promise.all([fetchSoilStatus(), fetchSoilToday()]);
    setStatus(s);
    setTodayLog(t);
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const handleUsual = async () => {
    setSaving(true);
    try {
      const result = await logUsualDay();
      setTodayLog(result.log);
      setJustLogged(true);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const patch = async (fields: Partial<DailyLog>) => {
    if (!todayLog) return;
    setSaving(true);
    try {
      const updated = await updateLog(todayLog.id, fields);
      setTodayLog(updated);
      const s = await fetchSoilStatus();
      setStatus(s);
    } finally {
      setSaving(false);
    }
  };

  const loadReport = async () => {
    setLoadingReport(true);
    try {
      setReport(await fetchWeeklySoilReport());
    } finally {
      setLoadingReport(false);
    }
  };

  const askAriaAboutSoil = async () => {
    if (ariaThinking) return;
    // 3分以内の再タップは無視（サーバー側も3分キャッシュ）
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

  return (
    <div className="soil-page">

      {/* ── 今日の土壌チェック（10秒） ── */}
      <section className="card soil-check-card">
        <p className="soil-kicker">今日の土壌チェック</p>
        {!todayLog ? (
          <>
            <p className="soil-muted">いつも通りなら、このボタンだけで終わりです。</p>
            <button className="soil-usual-btn" onClick={handleUsual} disabled={saving}>
              ✓ いつも通り（睡眠7h・気分ふつう）
            </button>
          </>
        ) : (
          <>
            <div className="soil-logged-row">
              <span className="soil-logged-badge">
                {justLogged ? "✓ 記録しました" : "✓ 今日は記録済み"}
              </span>
              <span className="soil-logged-summary">
                😴{todayLog.sleep_hours}h ／ {MOOD_OPTIONS.find((m) => m.value === todayLog.mood_score)?.label} ／ {ENERGY_OPTIONS.find((e) => e.value === todayLog.energy_level)?.label}
                {todayLog.did_workout && " ／ 💪"}
                {todayLog.drank_alcohol && " ／ 🍺"}
              </span>
              <button className="soil-adjust-btn" onClick={() => setAdjusting((v) => !v)}>
                {adjusting ? "閉じる" : "違った日だけ調整"}
              </button>
            </div>

            {adjusting && (
              <div className="soil-adjust-panel">
                <div className="soil-adjust-group">
                  <span>😴 睡眠</span>
                  <div className="soil-chip-row">
                    {SLEEP_OPTIONS.map((h) => (
                      <button key={h} className={`soil-chip ${todayLog.sleep_hours === h ? "active" : ""}`}
                        onClick={() => patch({ sleep_hours: h })} disabled={saving}>
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
                <div className="soil-adjust-group">
                  <span>気分</span>
                  <div className="soil-chip-row">
                    {MOOD_OPTIONS.map(({ value, label }) => (
                      <button key={value} className={`soil-chip ${todayLog.mood_score === value ? "active" : ""}`}
                        onClick={() => patch({ mood_score: value })} disabled={saving}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="soil-adjust-group">
                  <span>エネルギー</span>
                  <div className="soil-chip-row">
                    {ENERGY_OPTIONS.map(({ value, label }) => (
                      <button key={value} className={`soil-chip ${todayLog.energy_level === value ? "active" : ""}`}
                        onClick={() => patch({ energy_level: value })} disabled={saving}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="soil-adjust-group">
                  <span>その他</span>
                  <div className="soil-chip-row">
                    <button className={`soil-chip ${todayLog.did_workout ? "active" : ""}`}
                      onClick={() => patch({ did_workout: !todayLog.did_workout })} disabled={saving}>
                      💪 筋トレした
                    </button>
                    <button className={`soil-chip ${todayLog.drank_alcohol ? "active" : ""}`}
                      onClick={() => patch({ drank_alcohol: !todayLog.drank_alcohol })} disabled={saving}>
                      🍺 飲んだ
                    </button>
                  </div>
                </div>
                <Link to={`/private/log/edit/${todayLog.id}`} className="soil-detail-link">
                  もっと細かく記録する →
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── 土壌の状態（直近7日の自動判定） ── */}
      {status && (
        <section className={`card soil-status-card soil-${status.state}`}>
          <div className="soil-status-head">
            <span className="soil-status-icon">{SOIL_ICON[status.state] ?? "🌍"}</span>
            <div>
              <p className="soil-kicker">土壌の状態（直近7日）</p>
              <h2>{status.label}</h2>
            </div>
            {status.log_days > 0 && <span className="soil-days-badge">観測 {status.log_days}/7日</span>}
          </div>
          {status.log_days > 0 && (
            <div className="soil-bars">
              <ScoreBar label="😴 睡眠" value={status.sleep_score} />
              <ScoreBar label="🙂 気分" value={status.mood_score} />
              <ScoreBar label="🛌 回復" value={status.recovery_score} />
            </div>
          )}
          <div
            className={`soil-aria-bubble ${ariaComment ? "ai" : ""} ${ariaThinking ? "thinking" : ""}`}
            onClick={askAriaAboutSoil}
            title="タップするとアリアが土壌を見てコメントします"
          >
            <span className="soil-aria-face">
              {ariaThinking ? "(・ω・ )?" : "(＾ω＾)"} アリア
            </span>
            <p>
              {ariaThinking
                ? "……（土を観察中）"
                : ariaFailed
                  ? "（電波が悪いみたいです…少ししたらまたタップしてください）"
                  : ariaComment
                    ? `✨ ${ariaComment}`
                    : status.comment}
            </p>
            {!ariaComment && !ariaThinking && !ariaFailed && (
              <span className="soil-aria-hint">タップでアリアに聞く</span>
            )}
          </div>
        </section>
      )}

      {/* ── アリアの週次土壌報告 ── */}
      <section className="card soil-report-card">
        <div className="soil-report-head">
          <p className="soil-kicker">📜 アリアの週次土壌報告</p>
          {!report && (
            <button className="soil-report-btn" onClick={loadReport} disabled={loadingReport}>
              {loadingReport ? "アリアが観察中..." : "報告を聞く"}
            </button>
          )}
        </div>
        {report && (
          <>
            <div className="soil-report-bubble">
              <span className="soil-report-face">(＾ω＾) アリア</span>
              <p>{report.message}</p>
            </div>
            <div className="soil-report-stats">
              <span>😴 {report.avg_sleep}h <em>（先週 {report.prev_avg_sleep}h）</em></span>
              <span>🙂 {report.avg_mood}/5 <em>（先週 {report.prev_avg_mood}/5）</em></span>
              <span>💪 {report.workout_days}日</span>
              <span>🍺 {report.alcohol_days}日</span>
              <span>🏢 残業{report.overtime_hours}h</span>
            </div>
          </>
        )}
        {!report && !loadingReport && (
          <p className="soil-muted">週に一度、改善点を一つだけ。日曜の夜に聞くのがおすすめです。</p>
        )}
      </section>

    </div>
  );
}
