import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchAriaPresence } from "../api/client";
import { createScheduleMessage } from "../api/calendar";
import "./AriaPresence.css";

// 普段表示するローカル台詞（API消費ゼロ）。タップでGeminiに話しかける。
const PAGE_LINES: Record<string, string[]> = {
  "/dreams": [
    "夢を眺める時間も、畑仕事のうちですよ、ご主人様。",
    "どの夢から耕しますか？アリアはどれも楽しみです。",
  ],
  "/seeds": [
    "種は小さいほど植えやすいですよ、ご主人様。",
    "迷ったら30分以下の種を選ぶのがコツです。",
    "全部やらなくていいんです。今日の一粒だけ。",
  ],
  "/calendar": [
    "今週の時間を見ながら、アリアに声をかけてみてください。",
    "空いている区画に、種をひとつ植えてみませんか？",
    "植えた種は、30分でもちゃんと育ちますよ。",
  ],
  "/private": [
    "記録してくれるだけで、アリアは嬉しいです。",
    "正直に書いて大丈夫です。誰も責めません。",
    "疲れた日は、疲れたって書いていいんですよ。",
  ],
};

const TIME_LINES: [number, number, string[]][] = [
  [5, 11, ["おはようございます、ご主人様！", "朝の畑は気持ちいいですよ。"]],
  [11, 17, ["ご主人様、お疲れさまです。", "少し休憩も挟んでくださいね。"]],
  [17, 23, ["今日もあと少しですね、ご主人様。", "夜の30分は、自分のための時間に。"]],
  [23, 29, ["ご主人様、夜更かしは畑の敵です…！", "そろそろ休みましょう？アリアとの約束です。"]],
];

const FACES = ["(＾ω＾)", "(＾▽＾)", "(っ´ω`)ﾉ", "(ﾉ´∀｀)ﾉ", "(｀・ω・´)"];
const AI_COOLDOWN_MS = 3 * 60 * 1000;   // AI成功後は3分あける
const FAIL_COOLDOWN_MS = 30 * 1000;     // 失敗時は30秒後に再挑戦できる

function pageKey(pathname: string): string {
  for (const prefix of Object.keys(PAGE_LINES)) {
    if (pathname.startsWith(prefix)) return prefix.slice(1);
  }
  return "home";
}

function pickLines(pathname: string): string[] {
  for (const [prefix, lines] of Object.entries(PAGE_LINES)) {
    if (pathname.startsWith(prefix)) return lines;
  }
  const hour = new Date().getHours();
  const normalized = hour < 5 ? hour + 24 : hour;
  for (const [from, to, lines] of TIME_LINES) {
    if (normalized >= from && normalized < to) return lines;
  }
  return ["ご主人様、アリアはいつでもここにいます。"];
}

export default function AriaPresence() {
  const location = useLocation();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [failNote, setFailNote] = useState(false);
  const lastAiFetch = useRef<Record<string, number>>({});

  const lines = useMemo(() => pickLines(location.pathname), [location.pathname]);
  const face = useMemo(
    () => (thinking ? "(・ω・ )?" : FACES[Math.abs(location.pathname.length + index) % FACES.length]),
    [location.pathname, index, thinking],
  );

  useEffect(() => {
    setIndex(0);
    setOpen(true);
    setAiMessage(null);
  }, [location.pathname]);

  // ホームには大きいアリアがいるので常駐版は出さない
  if (location.pathname === "/") return null;

  const handleBubbleTap = async () => {
    if (thinking) return;

    // AIの返事を表示中、またはクールダウン中はローカル台詞をローテーション
    const isCalendarWeek = location.pathname === "/calendar" && document.body.dataset.ariaContext === "calendar-week";
    const key = isCalendarWeek ? "calendar-week" : pageKey(location.pathname);
    const last = lastAiFetch.current[key] ?? 0;
    if (aiMessage || Date.now() - last < AI_COOLDOWN_MS) {
      setAiMessage(null);
      setIndex((i) => i + 1);
      return;
    }

    setThinking(true);
    try {
      if (isCalendarWeek) {
        const result = await createScheduleMessage(document.body.dataset.ariaWeekStart);
        lastAiFetch.current[key] = result.is_fallback
          ? Date.now() - AI_COOLDOWN_MS + FAIL_COOLDOWN_MS
          : Date.now();
        setAiMessage(`${result.message}${result.is_fallback ? " ※自動生成" : ""}`);
        return;
      }
      const result = await fetchAriaPresence(key);
      if (result.is_ai) {
        lastAiFetch.current[key] = Date.now();
        setAiMessage(result.message);
      } else {
        // フォールバック応答: AI扱いせず、30秒後に再挑戦できる
        lastAiFetch.current[key] = Date.now() - AI_COOLDOWN_MS + FAIL_COOLDOWN_MS;
        setAiMessage(null);
        setFailNote(true);
        setTimeout(() => setFailNote(false), 4000);
      }
    } catch {
      lastAiFetch.current[key] = Date.now() - AI_COOLDOWN_MS + FAIL_COOLDOWN_MS;
      setFailNote(true);
      setTimeout(() => setFailNote(false), 4000);
    } finally {
      setThinking(false);
    }
  };

  const bubbleText = thinking
    ? "……（考え中）"
    : failNote
      ? "（電波が悪いみたいです…30秒ほどしたらまた話しかけてください）"
      : aiMessage
        ? `✨ ${aiMessage}`
        : lines[index % lines.length];

  return (
    <div className={`aria-presence ${open ? "open" : ""}`}>
      {open && (
        <div
          className={`aria-presence-bubble ${aiMessage ? "ai" : ""} ${thinking ? "thinking" : ""}`}
          onClick={handleBubbleTap}
        >
          {bubbleText}
        </div>
      )}
      <button
        type="button"
        className="aria-presence-face"
        title="アリア"
        onClick={() => setOpen((v) => !v)}
      >
        {face}
      </button>
    </div>
  );
}
