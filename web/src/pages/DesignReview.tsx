import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Send, FileText, Users, Scale, Play, Loader2, AlertCircle, Bot } from 'lucide-react';
import { useSessionDetailStore } from '../stores/sessionDetailStore';

const DesignReview = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'law'>('overview');
  const [iterations, setIterations] = useState(20);
  const [reviewed, setReviewed] = useState(false);
  const [input, setInput] = useState('');
  const [agentSearch, setAgentSearch] = useState('');

  const {
    session,
    refinementMessages,
    agents,
    loading,
    chatPending,
    error,
    loadSession,
    sendRefinementMessage,
    startSimulation,
    reset,
  } = useSessionDetailStore();

  useEffect(() => {
    if (!id) return;
    reset();
    loadSession(id);
  }, [id]);

  // Redirect if not in design-review stage
  useEffect(() => {
    if (!session || loading) return;
    if (session.stage === 'brainstorming' || session.stage === 'idea-input' || session.stage === 'designing') {
      navigate(`/session/${id}/brainstorm`, { replace: true });
    }
    if (session.stage === 'simulating' || session.stage === 'reflecting' || session.stage === 'completed') {
      navigate(`/session/${id}/simulation`, { replace: true });
    }
    // Sync iterations from config
    if (session.config?.totalIterations) {
      setIterations(session.config.totalIterations);
    }
  }, [session?.stage, loading]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [refinementMessages, chatPending]);

  const handleSend = async () => {
    if (!input.trim() || chatPending || !id) return;
    const text = input.trim();
    setInput('');
    await sendRefinementMessage(id, text);
  };

  const handleStartSimulation = async () => {
    if (!id) return;
    await startSimulation(id, iterations);
    navigate(`/session/${id}/simulation`);
  };

  const filteredAgents = agents.filter(a =>
    !agentSearch || a.name.toLowerCase().includes(agentSearch.toLowerCase()) || a.role.toLowerCase().includes(agentSearch.toLowerCase())
  );

  if (loading && !session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={32} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const tabBtnStyle = (tab: string) => ({
    flex: 1,
    padding: '1rem',
    background: activeTab === tab ? 'var(--panel-alpha-05)' : 'transparent',
    border: 'none',
    color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
    cursor: 'pointer',
    borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '0.5rem',
  });

  return (
    <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <h1 className="page-title" style={{ fontSize: '1.5rem' }}>
          {session?.title ?? 'Design Review'}
        </h1>
        {session?.timeScale && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>⏱ {session.timeScale}</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>

        {/* Left Side: Documents Panel (~60%) */}
        <div className="glass-panel" style={{ flex: 6, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
            <button style={tabBtnStyle('overview')} onClick={() => setActiveTab('overview')}>
              <FileText size={18} /> Overview
            </button>
            <button style={tabBtnStyle('agents')} onClick={() => setActiveTab('agents')}>
              <Users size={18} /> Agents ({agents.length})
            </button>
            <button style={tabBtnStyle('law')} onClick={() => setActiveTab('law')}>
              <Scale size={18} /> Law
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
            {activeTab === 'overview' && (
              <div>
                <h2 style={{ color: 'var(--color-bright)', marginBottom: '1rem' }}>{session?.title}</h2>
                {session?.societyOverview ? (
                  <div style={{ lineHeight: 1.8, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                    {session.societyOverview}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-dim)' }}>No overview available.</p>
                )}
                {session?.timeScale && (
                  <div style={{ marginTop: '1.5rem', padding: '0.75rem 1rem', background: 'var(--panel-alpha-05)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <strong>Time Scale:</strong> {session.timeScale}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'agents' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.1rem' }}>Agent Roster ({agents.length} agents)</h3>
                  <input
                    type="text"
                    placeholder="Search by name or role..."
                    className="input-glass"
                    style={{ padding: '0.5rem 1rem', width: '220px' }}
                    value={agentSearch}
                    onChange={e => setAgentSearch(e.target.value)}
                  />
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.75rem' }}>Name</th>
                      <th style={{ padding: '0.75rem' }}>Role</th>
                      <th style={{ padding: '0.75rem' }}>Wealth</th>
                      <th style={{ padding: '0.75rem' }}>Health</th>
                      <th style={{ padding: '0.75rem' }}>Happy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.map(a => (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '0.75rem' }}>{a.name}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{a.role}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--warning)' }}>{a.initialStats.wealth}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--success)' }}>{a.initialStats.health}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--primary)' }}>{a.initialStats.happiness}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredAgents.length === 0 && (
                  <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: '2rem' }}>No agents match your search.</p>
                )}
              </div>
            )}

            {activeTab === 'law' && (
              <div>
                <h2 style={{ color: 'var(--color-bright)', marginBottom: '1rem' }}>Virtual Law</h2>
                {session?.law ? (
                  <div style={{ lineHeight: 1.8, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                    {session.law}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-dim)' }}>No law available.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Refinement Chat (~40%) */}
        <div className="glass-panel" style={{ flex: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)', background: 'var(--panel-dark-10)', flexShrink: 0 }}>
            <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bot size={18} /> Refinement Chat
            </h3>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {refinementMessages.length === 0 && (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>
                Ask the Central Agent to make changes to the design.
              </p>
            )}
            {refinementMessages.map((msg, idx) => (
              <div key={msg.id ?? idx} style={{
                background: msg.role === 'user' ? 'rgba(79, 70, 229, 0.2)' : 'var(--panel-alpha-05)',
                border: '1px solid',
                borderColor: msg.role === 'user' ? 'rgba(79, 70, 229, 0.4)' : 'var(--glass-border)',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}>
                <span style={{ fontSize: '0.8rem', color: msg.role === 'user' ? 'var(--primary)' : 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>
                  {msg.role === 'user' ? 'You' : 'Central Agent'}
                </span>
                <span style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.content}</span>
              </div>
            ))}

            {chatPending && (
              <div style={{ background: 'var(--panel-alpha-05)', border: '1px solid var(--glass-border)', padding: '0.75rem 1rem', borderRadius: '8px', alignSelf: 'flex-start', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Central Agent is thinking…
              </div>
            )}

            {error && (
              <div style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="input-glass"
                placeholder="Request a change..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !chatPending && handleSend()}
                disabled={chatPending}
              />
              <button
                className="btn-secondary"
                onClick={handleSend}
                disabled={chatPending || !input.trim()}
                style={{ width: '48px', padding: 0, justifyContent: 'center' }}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="glass-card" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: reviewed ? 'var(--success)' : 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={reviewed}
              onChange={e => setReviewed(e.target.checked)}
              style={{ accentColor: 'var(--success)', width: '18px', height: '18px' }}
            />
            I have reviewed the society design
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Iterations:</span>
            <input
              type="number"
              className="input-glass"
              value={iterations}
              onChange={e => setIterations(Math.min(100, Math.max(1, Number(e.target.value))))}
              style={{ width: '80px', padding: '0.5rem' }}
              min={1}
              max={100}
            />
          </div>

          <button
            className="btn-primary"
            onClick={handleStartSimulation}
            disabled={!reviewed}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: reviewed ? 1 : 0.5 }}
          >
            <Play size={18} /> Start Simulation
          </button>
        </div>
      </div>
    </div>
  );
};

export default DesignReview;
