import { useEffect, useState } from "react";
import { fetchFocusInsights } from "../api/client";
import "./Blueprint.css";

const PILLARS = [
  {
    key: "complete",
    number: "01",
    title: "作り切る",
    lead: "3か月でノベルゲームを完成させる",
    purpose: "最後まで遊べる作品を完成させる",
    result: "ノベルゲーム完成",
    minimum: "創作に5分触れる",
    rhythm: "平日15〜30分＋休日集中",
  },
  {
    key: "deliver",
    number: "02",
    title: "届ける",
    lead: "作品を地中に埋めたままにしない",
    purpose: "なろう投稿と制作発信で外へ出す",
    result: "投稿・発信を週に一つ",
    minimum: "候補を一つ外へ出す",
    rhythm: "反応だけを成否にしない",
  },
  {
    key: "sharpen",
    number: "03",
    title: "磨き続ける",
    lead: "知識を、その日の創作技術へ変える",
    purpose: "読書と文章研究を原稿へ還元する",
    result: "学びを一つ原稿で試す",
    minimum: "本を2ページ開く",
    rhythm: "夜の静かな時間に読む",
  },
];

const WEEK = [
  ["月", "ノベルゲーム"],
  ["火", "リングフィット＋軽い創作"],
  ["水", "ノベルゲーム"],
  ["木", "ノベルゲーム"],
  ["金", "ノベルゲーム"],
  ["土", "集中制作＋発信・転職活動"],
  ["日", "朝ジム＋振り返り"],
];

type Review = { keep: string; change: string; stop: string };

function loadReview(): Review {
  try {
    return JSON.parse(localStorage.getItem("life-blueprint-review") ?? "") as Review;
  } catch {
    return { keep: "平日の創作接続", change: "", stop: "" };
  }
}

export default function Blueprint() {
  const [insights, setInsights] = useState<{ id: number; icon: string; title: string; text: string }[]>([]);
  const [review, setReview] = useState<Review>(loadReview);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchFocusInsights().then(setInsights).catch(() => setInsights([]));
  }, []);

  const saveReview = () => {
    localStorage.setItem("life-blueprint-review", JSON.stringify(review));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const principles = [
    ...insights.slice(0, 2),
    {
      id: -1,
      icon: "🏃",
      title: "平日はバトンを落とさない",
      text: "休日に深く走るため、平日は最低5分だけ創作との接続を保つ。",
    },
  ];

  return (
    <main className="blueprint-page">
      <header className="blueprint-hero">
        <div>
          <p>人生の設計図</p>
          <span>2026.07 — 2026.10</span>
        </div>
        <h1>生活を整えながら、毎日創作に触れ、<br />作品を完成させて外へ届ける。</h1>
        <aside><span>次回見直し</span><strong>8月2日</strong><small>日曜・5分だけ</small></aside>
      </header>

      <section className="blueprint-pillars" aria-labelledby="pillars-title">
        <header><p>今期の三本柱</p><h2 id="pillars-title">迷ったら、ここへ戻る</h2></header>
        <div>
          {PILLARS.map((pillar) => (
            <article id={`pillar-${pillar.key}`} className={`blueprint-pillar ${pillar.key}`} key={pillar.key}>
              <span>{pillar.number}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.lead}</p>
              <dl>
                <div><dt>目的</dt><dd>{pillar.purpose}</dd></div>
                <div><dt>今期の成果</dt><dd>{pillar.result}</dd></div>
                <div><dt>最低ライン</dt><dd>{pillar.minimum}</dd></div>
                <div><dt>基本リズム</dt><dd>{pillar.rhythm}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <div className="blueprint-foundation">
        <section className="blueprint-infrastructure">
          <header><p>生活インフラ</p><h2>努力を支える、考えなくていい仕組み</h2></header>
          <dl>
            <div><dt>睡眠</dt><dd>23:00 就寝 / 6:00 起床</dd></div>
            <div><dt>心</dt><dd>朝10分瞑想</dd></div>
            <div><dt>身体</dt><dd>火曜 リングフィット / 日曜朝 ジム</dd></div>
            <div><dt>食事</dt><dd>高たんぱく・低脂肪 / バナナ・キウイを定番化</dd></div>
            <div><dt>補助</dt><dd>ビタミンD / マグネシウム / クレアチン</dd></div>
          </dl>
        </section>

        <section className="blueprint-week">
          <header><p>週間リズム</p><h2>曜日に判断を預ける</h2></header>
          <ol>
            {WEEK.map(([day, role]) => <li key={day}><strong>{day}</strong><span>{role}</span></li>)}
          </ol>
        </section>
      </div>

      <section className="blueprint-principles" id="principles">
        <header><p>今の原則</p><h2>過去の自分から、今日の自分へ</h2></header>
        <div>
          {principles.map((item) => (
            <article key={item.id}><span>{item.icon}</span><h3>{item.title}</h3><p>{item.text}</p></article>
          ))}
        </div>
      </section>

      <section className="blueprint-review">
        <header><div><p>日曜の見直し</p><h2>増やす前に、余計なものを減らす</h2></div><span>{saved ? "保存しました" : "5分で十分"}</span></header>
        <div>
          {(["keep", "change", "stop"] as const).map((key) => (
            <label key={key} className={key}>
              <span>{key === "keep" ? "続ける" : key === "change" ? "変える" : "やめる"}</span>
              <textarea value={review[key]} onChange={(event) => setReview({ ...review, [key]: event.target.value })} placeholder="今週、一つだけ" />
            </label>
          ))}
        </div>
        <button type="button" onClick={saveReview}>見直しを保存</button>
      </section>
    </main>
  );
}
