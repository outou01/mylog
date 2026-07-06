import { NavLink } from "react-router-dom";
import "./PrivateLife.css";

const tabs = [
  { to: "/private/soil", label: "🌍 土壌チェック" },
  { to: "/private/log", label: "詳細ログ" },
  { to: "/private/logs", label: "ログ一覧" },
  { to: "/private/weekly", label: "週次" },
  { to: "/private/briefing", label: "週末" },
  { to: "/private/month-log", label: "月記録" },
  { to: "/private/analysis", label: "分析" },
];

export default function PrivateLife({ children }: { children: React.ReactNode }) {
  return (
    <div className="private-life-page">
      <section className="private-life-head">
        <div>
          <p>土壌</p>
          <h1>体調は、すべての土台</h1>
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
