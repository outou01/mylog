import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import "./AriaPresence.css";

// APIを消費しないローカル台詞。ページと時間帯で変わる。
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
    "予定は約束じゃなくて、未来へのメモです。",
    "空白の時間も、ちゃんと意味がありますよ。",
    "30分だけ、畑の時間を置いてみませんか？",
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

  const lines = useMemo(() => pickLines(location.pathname), [location.pathname]);
  const face = useMemo(
    () => FACES[Math.abs(location.pathname.length + index) % FACES.length],
    [location.pathname, index],
  );

  useEffect(() => {
    setIndex(0);
    setOpen(true);
  }, [location.pathname]);

  // ホームには大きいアリアがいるので常駐版は出さない
  if (location.pathname === "/") return null;

  return (
    <div className={`aria-presence ${open ? "open" : ""}`}>
      {open && (
        <div className="aria-presence-bubble" onClick={() => setIndex((i) => i + 1)}>
          {lines[index % lines.length]}
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
