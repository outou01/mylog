import { useEffect, useState } from "react";
import { fetchAriaMessage, AriaMessage } from "../api/client";
import "./Aria.css";

const MOOD_FACE: Record<string, string> = {
  happy:   "(＾▽＾)",
  proud:   "(≧◡≦)",
  worried: "(；ω；)",
  normal:  "(＾ω＾)",
};

const MOOD_COLOR: Record<string, string> = {
  happy:   "var(--accent)",
  proud:   "var(--green)",
  worried: "var(--yellow)",
  normal:  "var(--text-muted)",
};

export default function Aria() {
  const [data, setData] = useState<AriaMessage | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetchAriaMessage().then((d) => {
      setData(d);
      setTimeout(() => setVisible(true), 100);
    });
  }, []);

  if (!data) return null;

  return (
    <div className={`aria-wrap ${visible ? "in" : ""}`}>
      <div className="aria-avatar" style={{ color: MOOD_COLOR[data.mood] }}>
        <div className="aria-face">{MOOD_FACE[data.mood]}</div>
        <div className="aria-name">アリア</div>
      </div>
      <div className="aria-bubble">
        <p className="aria-text">{data.message}</p>
      </div>
    </div>
  );
}
