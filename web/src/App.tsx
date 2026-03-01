import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { Home, Settings, Box, MessageSquare, Edit3, Activity, PieChart, Users, FileText, LayoutDashboard, Sun, Moon, GitCompare } from 'lucide-react';

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
import { useSessionDetailStore } from './stores/sessionDetailStore';
import type { Stage } from '@idealworld/shared';

import './App.css';

// ── Session nav step definitions ────────────────────────────────────────────

type NavStep = 'idea' | 'brainstorm' | 'design' | 'simulation' | 'reflection' | 'review';

const NAV_ORDER: NavStep[] = ['idea', 'brainstorm', 'design', 'simulation', 'reflection', 'review'];

// Steps that get locked (non-clickable) once the user has moved past them
const ONE_WAY_STEPS = new Set<NavStep>(['idea', 'brainstorm']);

const STAGE_TO_STEP: Record<Stage, NavStep> = {
  'idea-input':           'idea',
  'brainstorming':        'brainstorm',
  'designing':            'brainstorm',
  'design-review':        'design',
  'refining':             'design',
  'simulating':           'simulation',
  'simulation-paused':    'simulation',
  'reflecting':           'reflection',
  'reflection-complete':  'reflection',
  'reviewing':            'review',
  'completed':            'review',
};

interface NavItemDef {
  step: NavStep;
  label: string;
  Icon: React.ComponentType<{ size: number }>;
  path: (id: string) => string;
}

const SESSION_NAV_ITEMS: NavItemDef[] = [
  { step: 'idea',       label: '① Idea Input',  Icon: Edit3,          path: id => `/session/${id}/idea` },
  { step: 'brainstorm', label: '② Brainstorm',   Icon: MessageSquare,  path: id => `/session/${id}/brainstorm` },
  { step: 'design',     label: '③ Design',       Icon: LayoutDashboard,path: id => `/session/${id}/design` },
  { step: 'simulation', label: '④ Simulation',   Icon: Activity,       path: id => `/session/${id}/simulation` },
  { step: 'reflection', label: '⑤ Reflection',   Icon: PieChart,       path: id => `/session/${id}/reflection` },
  { step: 'review',     label: '⑥ Review',       Icon: Users,          path: id => `/session/${id}/agents` },
];

// ── SessionNav component ─────────────────────────────────────────────────────

// Map URL last-segment → NavStep (used to derive active step from current route)
const URL_TO_STEP: Record<string, NavStep> = {
  idea: 'idea',
  brainstorm: 'brainstorm',
  design: 'design',
  simulation: 'simulation',
  reflection: 'reflection',
  agents: 'review',
};

function SessionNav({ sessionId }: { sessionId: string }) {
  const { session } = useSessionDetailStore();
  const location = useLocation();

  // Active step: always derived from the URL (which page the user is actually on).
  // This is correct even when sessionDetailStore hasn't been refreshed by the
  // current page (e.g. Simulation page uses its own store, not sessionDetailStore).
  const lastSegment = location.pathname.split('/').at(-1) ?? '';
  const activeStepFromUrl: NavStep | null = URL_TO_STEP[lastSegment] ?? null;
  const isOnArtifacts = lastSegment === 'artifacts';

  // Progress: use the higher of the store-reported stage vs the URL-implied stage.
  // This ensures nav items aren't incorrectly disabled when the store is stale.
  const storeStep: NavStep = session?.stage ? STAGE_TO_STEP[session.stage] : 'idea';
  const urlStep: NavStep = activeStepFromUrl ?? 'idea';
  const progressIdx = Math.max(NAV_ORDER.indexOf(storeStep), NAV_ORDER.indexOf(urlStep));

  const artifactsMinIdx = NAV_ORDER.indexOf('design'); // accessible from design onwards

  return (
    <div className="session-nav">
      <div className="session-title">Session Progress</div>

      {SESSION_NAV_ITEMS.map(({ step, label, Icon, path }) => {
        const stepIdx = NAV_ORDER.indexOf(step);
        // isActive: which step is the user currently viewing (URL-based)
        const isActive = activeStepFromUrl ? step === activeStepFromUrl : step === storeStep;
        const isPast = stepIdx < progressIdx;
        const isUpcoming = stepIdx > progressIdx;

        // Locked = past AND one-way (idea, brainstorm)
        const isLocked = isPast && ONE_WAY_STEPS.has(step);
        // Disabled = locked OR not yet reached
        const isDisabled = isLocked || isUpcoming;

        const navClass = `nav-item${isActive ? ' active' : ''}`;
        const disabledStyle: React.CSSProperties = { opacity: 0.35, cursor: 'not-allowed', pointerEvents: 'none' };

        return isDisabled ? (
          <div key={step} className={navClass} style={disabledStyle}>
            <Icon size={20} />
            <span>{label}</span>
          </div>
        ) : (
          <Link key={step} to={path(sessionId)} className={navClass}>
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        );
      })}

      {/* Artifacts — accessible once design is reached */}
      {progressIdx >= artifactsMinIdx ? (
        <Link to={`/session/${sessionId}/artifacts`} className={`nav-item${isOnArtifacts ? ' active' : ''}`}>
          <FileText size={20} />
          <span>📄 Artifacts</span>
        </Link>
      ) : (
        <div className="nav-item" style={{ opacity: 0.35, cursor: 'not-allowed', pointerEvents: 'none' }}>
          <FileText size={20} />
          <span>📄 Artifacts</span>
        </div>
      )}
    </div>
  );
}

// ── Main layout ──────────────────────────────────────────────────────────────

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const location = useLocation();
  const isSessionActive = location.pathname.includes('/session/');
  const sessionId = location.pathname.match(/\/session\/([^/]+)/)?.[1] ?? '';

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
          <Link to="/compare" className={`nav-item ${location.pathname === '/compare' ? 'active' : ''}`}>
            <GitCompare size={22} />
            <span>Compare</span>
          </Link>

          {isSessionActive && sessionId && sessionId !== 'new' && (
            <SessionNav sessionId={sessionId} />
          )}

          {isSessionActive && sessionId === 'new' && (
            <div className="session-nav">
              <div className="session-title">Session Progress</div>
              {SESSION_NAV_ITEMS.map(({ step, label, Icon }) => (
                <div
                  key={step}
                  className={`nav-item${step === 'idea' ? ' active' : ''}`}
                  style={step !== 'idea' ? { opacity: 0.35, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </div>
              ))}
              <div className="nav-item" style={{ opacity: 0.35, cursor: 'not-allowed', pointerEvents: 'none' }}>
                <FileText size={20} />
                <span>📄 Artifacts</span>
              </div>
            </div>
          )}
        </nav>

        <div style={{ marginTop: 'auto', padding: '1rem' }}>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="nav-item"
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', justifyContent: 'flex-start' }}
          >
            {theme === 'dark' ? <Moon size={22} /> : <Sun size={22} />}
            <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
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
