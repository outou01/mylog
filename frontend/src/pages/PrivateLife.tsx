import { NavLink } from "react-router-dom";
import "./PrivateLife.css";

const tabs = [
  { to: "/private/log", label: "ログ入力" },
  { to: "/private/logs", label: "ログ一覧" },
  { to: "/private/weekly", label: "週次レポート" },
  { to: "/private/briefing", label: "週末レポート" },
  { to: "/private/month-log", label: "月記録" },
  { to: "/private/analysis", label: "分析" },
];

export default function PrivateLife({ children }: { children: React.ReactNode }) {
  return (
    <div className="private-life-page">
      <section className="private-life-head">
        <div>
          <p>私生活</p>
          <h1>自分の時間を整える</h1>
        </div>
      </section>

      <nav className="private-life-tabs">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to}>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="private-life-content">{children}</div>
    </div>
  );
}
