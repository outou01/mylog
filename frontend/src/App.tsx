import { Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import LogForm from "./pages/LogForm";
import LogList from "./pages/LogList";
import WeeklyReport from "./pages/WeeklyReport";
import Briefing from "./pages/Briefing";
import Calendar from "./pages/Calendar";
import MonthLog from "./pages/MonthLog";
import PatternAnalysis from "./pages/PatternAnalysis";
import "./App.css";

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="container header-inner">
          <span className="logo">AI Life Console</span>
          <nav className="nav">
            <NavLink to="/" end>ホーム</NavLink>
            <NavLink to="/log">ログ入力</NavLink>
            <NavLink to="/calendar">カレンダー</NavLink>
            <NavLink to="/month-log">月ログ</NavLink>
            <NavLink to="/analysis">分析</NavLink>
            <NavLink to="/logs">一覧</NavLink>
            <NavLink to="/weekly">週次</NavLink>
            <NavLink to="/briefing">週末</NavLink>
          </nav>
        </div>
      </header>
      <main className="main">
        <div className="container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/log" element={<LogForm />} />
            <Route path="/log/edit/:id" element={<LogForm />} />
            <Route path="/logs" element={<LogList />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/month-log" element={<MonthLog />} />
            <Route path="/analysis" element={<PatternAnalysis />} />
            <Route path="/weekly" element={<WeeklyReport />} />
            <Route path="/briefing" element={<Briefing />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
