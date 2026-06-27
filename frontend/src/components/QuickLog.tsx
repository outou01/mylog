import { useState, useRef } from "react";
import { parseQuickLog, createLog, QuickLogParsed } from "../api/client";
import "./QuickLog.css";

const MOOD_LABEL: Record<number, string> = { 1: "😞 かなり悪い", 2: "😕 悪い", 3: "😐 普通", 4: "🙂 良い", 5: "😄 かなり良い" };

interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

interface Props {
  onRegistered?: () => void;
}

export default function QuickLog({ onRegistered }: Props) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<QuickLogParsed | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const [parseError, setParseError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  const handleParse = async () => {
    if (!text.trim()) return;
    setParsing(true);
    setParseError("");
    setParsed(null);
    setDone(false);
    try {
      const result = await parseQuickLog(text);
      setParsed(result);
    } catch {
      setParseError("解析に失敗しました。もう一度試してください。");
    } finally {
      setParsing(false);
    }
  };

  const handleRegister = async () => {
    if (!parsed) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await createLog({ ...parsed, memo: parsed.memo ?? "" });
      setDone(true);
      setText("");
      setParsed(null);
      onRegistered?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setSubmitError(msg ?? "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const updateParsed = (key: keyof QuickLogParsed, value: unknown) =>
    setParsed((p) => p ? { ...p, [key]: value } : p);

  const handleVoice = () => {
    if (!SpeechRecognitionCtor) {
      alert("このブラウザは音声入力に対応していません。Chromeをお使いください。");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "ja-JP";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onresult = (event: { results: SpeechRecognitionResultList }) => {
      const transcript = event.results[0][0].transcript;
      setText((prev) => prev ? prev + "。" + transcript : transcript);
      setParsed(null);
      setDone(false);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  return (
    <div className="quick-log">
      <div className="ql-header">
        <span className="ql-badge">QUICK LOG</span>
        <span className="ql-hint">自然文・音声からログを自動生成します</span>
      </div>

      <div className="ql-input-row">
        <textarea
          className="ql-textarea"
          rows={4}
          placeholder="例: 今日は6時間寝た。残業2時間。筋トレはしてないけどWebサービスを少し触れた。気分はまあまあ。"
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(null); setDone(false); }}
        />
        <button
          className={`ql-mic-btn ${listening ? "active" : ""}`}
          onClick={handleVoice}
          title={listening ? "停止" : "音声入力"}
          type="button"
        >
          {listening ? "⏹" : "🎤"}
        </button>
      </div>
      {listening && <p className="ql-listening">🔴 録音中... もう一度押すと停止</p>}

      <button className="btn btn-accent ql-parse-btn" onClick={handleParse}
        disabled={parsing || !text.trim()}>
        {parsing ? "AI解析中..." : "AIでログ化"}
      </button>

      {parseError && <p className="ql-error">{parseError}</p>}

      {done && <p className="ql-success">✓ ログを登録しました！</p>}

      {parsed && (
        <div className="ql-preview">
          <div className="ql-preview-title">▶ 変換結果プレビュー（修正可能）</div>

          <div className="ql-fields">
            <div className="ql-field">
              <label>日付</label>
              <input type="date" value={parsed.date}
                onChange={(e) => updateParsed("date", e.target.value)} />
            </div>

            <div className="ql-field">
              <label>睡眠時間 <span className="ql-val">{parsed.sleep_hours}h</span></label>
              <input type="range" min={0} max={12} step={0.5} value={parsed.sleep_hours}
                onChange={(e) => updateParsed("sleep_hours", parseFloat(e.target.value))} />
            </div>

            <div className="ql-field">
              <label>残業時間 <span className="ql-val">{parsed.overtime_hours}h</span></label>
              <input type="range" min={0} max={8} step={0.5} value={parsed.overtime_hours}
                onChange={(e) => updateParsed("overtime_hours", parseFloat(e.target.value))} />
            </div>

            <div className="ql-field">
              <label>気分</label>
              <div className="ql-mood">
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <button key={n} type="button"
                    className={`ql-mood-btn ${parsed.mood_score === n ? "active" : ""}`}
                    onClick={() => updateParsed("mood_score", n)}>
                    {n}
                  </button>
                ))}
                <span className="ql-mood-label">{MOOD_LABEL[parsed.mood_score]}</span>
              </div>
            </div>

            <div className="ql-field ql-toggles">
              {(
                [
                  ["did_workout", "💪 筋トレ"],
                  ["did_create", "🎨 創作"],
                  ["did_code", "💻 開発"],
                  ["drank_alcohol", "🍺 飲酒"],
                ] as [keyof QuickLogParsed, string][]
              ).map(([key, label]) => (
                <label key={key} className={`ql-toggle ${parsed[key] ? "on" : ""}`}>
                  <input type="checkbox" checked={!!parsed[key]}
                    onChange={(e) => updateParsed(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>

            <div className="ql-field">
              <label>メモ</label>
              <textarea rows={2} value={parsed.memo}
                onChange={(e) => updateParsed("memo", e.target.value)} />
            </div>
          </div>

          {submitError && <p className="ql-error">{submitError}</p>}

          <button className="btn btn-primary ql-register-btn"
            onClick={handleRegister} disabled={submitting}>
            {submitting ? "登録中..." : "この内容で登録する"}
          </button>
        </div>
      )}
    </div>
  );
}
