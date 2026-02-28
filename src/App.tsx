import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { Home, Settings, Box, MessageSquare, Edit3, Activity, PieChart, Users, FileText, LayoutDashboard, Sun, Moon } from 'lucide-react';

// STUB COMPONENTS
import HomePage from './pages/HomePage';
import IdeaInput from './pages/IdeaInput';
import Brainstorming from './pages/Brainstorming';
import DesignReview from './pages/DesignReview';
import Simulation from './pages/Simulation';
import Reflection from './pages/Reflection';
import AgentReview from './pages/AgentReview';
import Artifacts from './pages/Artifacts';
import SettingsPage from './pages/SettingsPage';
import CompareSessions from './pages/CompareSessions';

import './App.css';

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const location = useLocation();
  const isSessionActive = location.pathname.includes('/session/');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="app-container">
      {/* Sidebar - Persistent */}
      <aside className="sidebar glass-panel expanded">
        <div className="sidebar-header">
          <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
            <Box size={28} color="var(--primary)" />
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Ideal World</h2>
          </div>
        </div>

        <nav className="nav-menu">
          <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
            <Home size={22} />
            <span>Home</span>
          </Link>
          <Link to="/settings" className={`nav-item ${location.pathname === '/settings' ? 'active' : ''}`}>
            <Settings size={22} />
            <span>Settings</span>
          </Link>

          {isSessionActive && (
            <div className="session-nav">
              <div className="session-title">Session Progress</div>

              <Link to="/session/1/idea" className={`nav-item ${location.pathname.includes('/idea') ? 'active' : ''}`}>
                <Edit3 size={20} />
                <span>① Idea Input</span>
              </Link>
              <Link to="/session/1/brainstorm" className={`nav-item ${location.pathname.includes('/brainstorm') ? 'active' : ''}`}>
                <MessageSquare size={20} />
                <span>② Brainstorm</span>
              </Link>
              <Link to="/session/1/design" className={`nav-item ${location.pathname.includes('/design') ? 'active' : ''}`}>
                <LayoutDashboard size={20} />
                <span>③ Design</span>
              </Link>
              <Link to="/session/1/simulation" className={`nav-item ${location.pathname.includes('/simulation') ? 'active' : ''}`}>
                <Activity size={20} />
                <span>④ Simulation</span>
              </Link>
              <Link to="/session/1/reflection" className={`nav-item ${location.pathname.includes('/reflection') ? 'active' : ''}`}>
                <PieChart size={20} />
                <span>⑤ Reflection</span>
              </Link>
              <Link to="/session/1/agents" className={`nav-item ${location.pathname.includes('/agents') ? 'active' : ''}`}>
                <Users size={20} />
                <span>⑥ Review</span>
              </Link>
              <Link to="/session/1/artifacts" className={`nav-item ${location.pathname.includes('/artifacts') ? 'active' : ''}`}>
                <FileText size={20} />
                <span>📄 Artifacts</span>
              </Link>
            </div>
          )}
        </nav>

        <div style={{ marginTop: 'auto', padding: '1rem' }}>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="nav-item"
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', justifyContent: 'flex-start' }}
          >
            {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/compare" element={<CompareSessions />} />
          <Route path="/session/:id/idea" element={<IdeaInput />} />
          <Route path="/session/:id/brainstorm" element={<Brainstorming />} />
          <Route path="/session/:id/design" element={<DesignReview />} />
          <Route path="/session/:id/simulation" element={<Simulation />} />
          <Route path="/session/:id/reflection" element={<Reflection />} />
          <Route path="/session/:id/agents" element={<AgentReview />} />
          <Route path="/session/:id/artifacts" element={<Artifacts />} />
        </Routes>
      </MainLayout>
    </Router>
  );
}

export default App;
