import { ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import DreamDetail from "./pages/DreamDetail";
import Dreams from "./pages/Dreams";
import LogForm from "./pages/LogForm";
import LogList from "./pages/LogList";
import WeeklyReport from "./pages/WeeklyReport";
import Briefing from "./pages/Briefing";
import Calendar from "./pages/Calendar";
import MonthLog from "./pages/MonthLog";
import PatternAnalysis from "./pages/PatternAnalysis";
import PrivateLife from "./pages/PrivateLife";
import Seeds from "./pages/Seeds";
import AriaPresence from "./components/AriaPresence";
import "./App.css";

function PrivateLifeRoute({ children }: { children: ReactNode }) {
  return <PrivateLife>{children}</PrivateLife>;
}

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="container header-inner">
          <span className="logo">AI Life Console</span>
          <nav className="nav">
            <NavLink to="/" end>ホーム</NavLink>
            <NavLink to="/dreams">夢</NavLink>
            <NavLink to="/seeds">種リスト</NavLink>
            <NavLink to="/calendar">畑</NavLink>
            <NavLink to="/private">私生活</NavLink>
          </nav>
        </div>
      </header>
      <main className="main">
        <div className="container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dreams" element={<Dreams />} />
            <Route path="/dreams/:id" element={<DreamDetail />} />
            <Route path="/seeds" element={<Seeds />} />
            <Route path="/calendar" element={<Calendar />} />

            <Route path="/private" element={<Navigate to="/private/log" replace />} />
            <Route path="/private/log" element={<PrivateLifeRoute><LogForm /></PrivateLifeRoute>} />
            <Route path="/private/log/edit/:id" element={<PrivateLifeRoute><LogForm /></PrivateLifeRoute>} />
            <Route path="/private/logs" element={<PrivateLifeRoute><LogList /></PrivateLifeRoute>} />
            <Route path="/private/weekly" element={<PrivateLifeRoute><WeeklyReport /></PrivateLifeRoute>} />
            <Route path="/private/briefing" element={<PrivateLifeRoute><Briefing /></PrivateLifeRoute>} />
            <Route path="/private/month-log" element={<PrivateLifeRoute><MonthLog /></PrivateLifeRoute>} />
            <Route path="/private/analysis" element={<PrivateLifeRoute><PatternAnalysis /></PrivateLifeRoute>} />

            <Route path="/log" element={<Navigate to="/private/log" replace />} />
            <Route path="/log/edit/:id" element={<PrivateLifeRoute><LogForm /></PrivateLifeRoute>} />
            <Route path="/logs" element={<Navigate to="/private/logs" replace />} />
            <Route path="/weekly" element={<Navigate to="/private/weekly" replace />} />
            <Route path="/briefing" element={<Navigate to="/private/briefing" replace />} />
            <Route path="/month-log" element={<Navigate to="/private/month-log" replace />} />
            <Route path="/analysis" element={<Navigate to="/private/analysis" replace />} />
          </Routes>
        </div>
      </main>
      <AriaPresence />
    </div>
  );
}
