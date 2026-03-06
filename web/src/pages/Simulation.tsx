import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Pause, Square, Activity, Heart, CircleDollarSign, Users, Loader2, AlertCircle, ArrowRight, GitFork, Zap } from 'lucide-react';
import { useSimulationStore } from '../stores/simulationStore';
import { useShallow } from 'zustand/react/shallow';
import MarkdownText from '../components/MarkdownText';

const Simulation = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const feedEndRef = useRef<HTMLDivElement>(null);

  const {
    isRunning, isPaused, isComplete,
    currentIteration, totalIterations,
    feed, statsHistory, agents, finalReport, error,
    loadAgents, loadHistory, connectSSE,
    pause, resume, abort, reset,
    continueSimulation, forkSimulation,
  } = useSimulationStore(useShallow(s => ({
    isRunning: s.isRunning, isPaused: s.isPaused, isComplete: s.isComplete,
    currentIteration: s.currentIteration, totalIterations: s.totalIterations,
    feed: s.feed, statsHistory: s.statsHistory, agents: s.agents,
    finalReport: s.finalReport, error: s.error,
    loadAgents: s.loadAgents, loadHistory: s.loadHistory, connectSSE: s.connectSSE,
    pause: s.pause, resume: s.resume, abort: s.abort, reset: s.reset,
    continueSimulation: s.continueSimulation, forkSimulation: s.forkSimulation,
  })));

  const [sessionStage, setSessionStage] = useState<string>('simulating');
  const [extraIterations, setExtraIterations] = useState(10);
  const [autoProceed, setAutoProceed] = useState(() => localStorage.getItem('sim-auto-proceed') === 'true');
  const autoProceedRef = useRef(autoProceed);
  const sseCleanupRef = useRef<(() => void) | null>(null);
  const hasAutoProceeded = useRef(false);

  // Keep ref in sync for use in effects without re-running them
  useEffect(() => {
    autoProceedRef.current = autoProceed;
    localStorage.setItem('sim-auto-proceed', autoProceed ? 'true' : 'false');
  }, [autoProceed]);

  useEffect(() => {
    if (!id) return;
    reset();
    loadAgents(id);
    loadHistory(id);

    // Immediately fetch session state to restore isRunning/isPaused/totalIterations
    // before the first SSE event arrives (which can take a long time during iterations)
    fetch(`/api/sessions/${id}`)
      .then(r => r.json())
      .then((s: { stage?: string; config?: { totalIterations?: number } | null }) => {
        if (s.stage) setSessionStage(s.stage);

        const targetIters = s.config?.totalIterations ?? 0;

        if (s.stage === 'simulating') {
          // Simulation is actively running; restore the running state immediately
          useSimulationStore.setState(prev => ({
            isRunning: true,
            isPaused: false,
            isComplete: false,
            // Use config's totalIterations as the denominator for progress bar
            totalIterations: targetIters > 0 ? targetIters : prev.totalIterations,
          }));
        } else if (s.stage === 'simulation-paused') {
          useSimulationStore.setState(prev => ({
            isRunning: false,
            isPaused: true,
            isComplete: false,
            totalIterations: targetIters > 0 ? targetIters : prev.totalIterations,
          }));
        } else if (s.stage && s.stage !== 'simulating' && s.stage !== 'simulation-paused') {
          // Simulation already finished
          const state = useSimulationStore.getState();
          if (!state.isRunning && !state.isComplete && state.feed.length > 0) {
            useSimulationStore.setState({ isComplete: true });
          }
        }
      })
      .catch(() => { });

    // Connect SSE for live updates; will close gracefully if simulation already done
    const disconnect = connectSSE(id);
    sseCleanupRef.current = disconnect;
    return disconnect;
  }, [id]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.length]);

  // Auto-proceed: when simulation finishes and toggle is on, navigate to reflection
  const handleAutoProceed = useCallback(async () => {
    if (!id || hasAutoProceeded.current) return;
    hasAutoProceeded.current = true;
    await fetch(`/api/sessions/${id}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'reflecting' }),
    });
    navigate(`/session/${id}/reflection`);
  }, [id, navigate]);

  useEffect(() => {
    if (isComplete && !isRunning && autoProceedRef.current && !hasAutoProceeded.current) {
      handleAutoProceed();
    }
  }, [isComplete, isRunning, handleAutoProceed]);

  const handlePauseResume = async () => {
    if (!id) return;
    if (isPaused) await resume(id);
    else await pause(id);
  };

  const handleAbort = async () => {
    if (!id) return;
    await abort(id);
    navigate(`/session/${id}/design`);
  };

  const latestStats = statsHistory[statsHistory.length - 1] ?? null;

  const getAgentColor = (agent: { currentStats: { health: number }; isAlive: boolean }) => {
    if (!agent.isAlive) return 'var(--text-dim)';
    const h = agent.currentStats.health;
    if (h >= 70) return 'var(--success)';
    if (h >= 40) return 'var(--warning)';
    return 'var(--danger)';
  };

  const progress = totalIterations > 0 ? (currentIteration / totalIterations) * 100 : 0;

  // Reversed feed for display (newest first)
  const reversedFeed = useMemo(() => [...feed].reverse(), [feed]);

  // Lifecycle events across all iterations (newest first, capped at 30)
  const allLifecycleEvents = useMemo(() =>
    feed.flatMap(f => f.lifecycleEvents.map(e => ({ ...e, iterNum: f.number }))).reverse().slice(0, 30),
    [feed]
  );

  const feedScrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>

      {/* Top Bar: Progress and Controls */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, marginRight: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
            {isComplete ? (
              <span style={{ color: 'var(--success)' }}><strong>Simulation Complete</strong></span>
            ) : isRunning ? (
              <span>
                <strong style={{ color: 'var(--color-bright)' }}>Iteration {currentIteration}</strong>
                {totalIterations > 0 && ` of ${totalIterations}`}
                <Loader2 size={14} style={{ marginLeft: '0.5rem', animation: 'spin 1s linear infinite', display: 'inline' }} />
              </span>
            ) : isPaused ? (
              <span style={{ color: 'var(--warning)' }}>Paused at iteration {currentIteration}</span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>Waiting for simulation to start…</span>
            )}
            {totalIterations > 0 && (
              <span style={{ color: 'var(--text-dim)' }}>{Math.round(progress)}%</span>
            )}
          </div>
          <div style={{ height: '8px', background: 'var(--panel-alpha-10)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: isComplete
                ? 'var(--success)'
                : 'linear-gradient(90deg, var(--primary), var(--success))',
              transition: 'width 1s linear',
            }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Auto-Proceed Toggle */}
          <div
            onClick={() => setAutoProceed(p => !p)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              cursor: 'pointer', userSelect: 'none',
              padding: '0.75rem 0.75rem', borderRadius: '8px',
              background: autoProceed ? 'rgba(16, 185, 129, 0.15)' : 'var(--panel-alpha-05)',
              border: `1px solid ${autoProceed ? 'rgba(16, 185, 129, 0.4)' : 'var(--glass-border)'}`,
              transition: 'all 0.2s ease',
            }}
            title="When enabled, automatically proceed to Reflection when simulation completes"
          >
            <div style={{
              width: '32px', height: '18px', borderRadius: '9px',
              background: autoProceed ? 'var(--success)' : 'var(--panel-alpha-10)',
              position: 'relative', transition: 'background 0.2s',
              border: `1px solid ${autoProceed ? 'rgba(16, 185, 129, 0.5)' : 'var(--glass-border)'}`,
            }}>
              <div style={{
                width: '14px', height: '14px', borderRadius: '50%',
                background: autoProceed ? '#fff' : 'var(--text-dim)',
                position: 'absolute', top: '1px',
                left: autoProceed ? '16px' : '1px',
                transition: 'left 0.2s ease, background 0.2s',
              }} />
            </div>
            <Zap size={14} color={autoProceed ? 'var(--success)' : 'var(--text-dim)'} />
            <span style={{ fontSize: '0.8rem', color: autoProceed ? 'var(--success)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
              Auto Proceed
            </span>
          </div>

          {(isRunning || isPaused) && !isComplete && (
            <button className="btn-secondary" onClick={handlePauseResume} style={{ width: '120px', justifyContent: 'center' }}>
              {isPaused ? <><Play size={18} /> Resume</> : <><Pause size={18} /> Pause</>}
            </button>
          )}
          {!isComplete && (
            <button
              className="btn-secondary"
              style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
              onClick={handleAbort}
            >
              <Square size={18} /> Abort
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Main Dashboard — Three Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.2fr) minmax(250px, 1fr) minmax(300px, 1fr)', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>

        {/* Col 1: Live Feed (virtualized) */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
            <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={18} color="var(--primary)" /> Live Feed
            </h3>
          </div>
          <div ref={feedScrollRef} style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
            {feed.length === 0 && !isRunning && (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>
                No iterations yet.
              </p>
            )}
            {/* Pending "next iteration" indicator */}
            {isRunning && feed.length > 0 && (
              <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--primary)', opacity: 0.6, marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>
                  Iteration {currentIteration + 1} <Loader2 size={12} style={{ display: 'inline', animation: 'spin 1s linear infinite' }} />
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Collecting agent intentions…</p>
              </div>
            )}
            {/* Feed list (newest first) */}
            {reversedFeed.map(entry => (
              <div key={entry.number} style={{ marginBottom: '1rem' }}>
                <div style={{
                  paddingLeft: '1rem',
                  borderLeft: `2px solid ${entry.number === currentIteration ? 'var(--primary)' : 'var(--glass-border)'}`,
                }}>
                  <h4 style={{
                    fontSize: '0.9rem',
                    color: entry.number === currentIteration ? 'var(--primary)' : 'var(--text-muted)',
                    marginBottom: '0.5rem',
                  }}>
                    Iteration {entry.number}
                    {entry.stats && (
                      <span style={{ fontWeight: 'normal', marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                        · {entry.stats.aliveCount} alive
                      </span>
                    )}
                  </h4>
                  <p style={{ fontSize: '0.95rem', lineHeight: 1.5, color: '#e5e7eb' }}>
                    <MarkdownText>{entry.narrativeSummary}</MarkdownText>
                  </p>
                </div>
              </div>
            ))}
            {isComplete && finalReport && (
              <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--success)', marginTop: '0.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--success)', marginBottom: '0.5rem' }}>Final Report</h4>
                <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#e5e7eb' }}>
                  <MarkdownText>{finalReport}</MarkdownText>
                </div>
              </div>
            )}
            <div ref={feedEndRef} />
          </div>
        </div>

        {/* Col 2: Statistics */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
            <h3 style={{ fontSize: '1.1rem' }}>Statistics</h3>
          </div>
          <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {latestStats ? (
              <>
                <StatCard
                  label="Wealth"
                  color="var(--warning)"
                  icon={<CircleDollarSign size={16} />}
                  avg={latestStats.avgWealth}
                  min={latestStats.minWealth}
                  max={latestStats.maxWealth}
                  history={statsHistory.map(s => s.avgWealth)}
                />
                <StatCard
                  label="Health"
                  color="var(--success)"
                  icon={<Heart size={16} />}
                  avg={latestStats.avgHealth}
                  min={latestStats.minHealth}
                  max={latestStats.maxHealth}
                  history={statsHistory.map(s => s.avgHealth)}
                />
                <StatCard
                  label="Happiness"
                  color="var(--primary)"
                  icon={<Users size={16} />}
                  avg={latestStats.avgHappiness}
                  min={latestStats.minHappiness}
                  max={latestStats.maxHappiness}
                  history={statsHistory.map(s => s.avgHappiness)}
                />
                <div style={{ background: 'var(--panel-alpha-05)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Users size={16} /> Population</span>
                    <span>{latestStats.aliveCount} / {latestStats.totalCount}</span>
                  </div>
                  {latestStats.giniWealth !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      <span title="Wealth inequality: 0=equal, 1=totally unequal">Gini (wealth)</span>
                      <span style={{ color: latestStats.giniWealth > 0.5 ? 'var(--danger)' : latestStats.giniWealth > 0.3 ? 'var(--warning)' : 'var(--success)' }}>
                        {latestStats.giniWealth.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>
                Stats will appear after the first iteration.
              </p>
            )}
          </div>
        </div>

        {/* Col 3: Agent Grid + Lifecycle */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
            <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} /> Agent Status
            </h3>
          </div>
          <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
            {agents.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem' }}>
                {agents.map(a => (
                  <div
                    key={a.id}
                    style={{
                      width: '14px', height: '14px',
                      borderRadius: '50%',
                      background: getAgentColor(a),
                      boxShadow: a.isAlive ? `0 0 5px ${getAgentColor(a)}` : 'none',
                      cursor: 'pointer',
                      opacity: a.isAlive ? 1 : 0.3,
                    }}
                    title={`${a.name} (${a.role}) — W:${a.currentStats.wealth} H:${a.currentStats.health} Hap:${a.currentStats.happiness}${!a.isAlive ? ' [dead]' : ''}`}
                  />
                ))}
              </div>
            ) : (
              <div style={{ marginBottom: '2rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                Agent data loading…
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '0 0 1rem' }} />

            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase' as const }}>
              Lifecycle Events
            </h4>
            {allLifecycleEvents.length === 0 ? (
              <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>No events yet.</div>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {allLifecycleEvents.map((e, idx) => (
                  <div key={idx} style={{ fontSize: '0.9rem', color: 'var(--text-dim)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Iter {e.iterNum}:</span>{' '}
                    <span style={{ color: e.type === 'death' ? 'var(--danger)' : 'var(--primary)' }}>
                      {e.type === 'death' ? '💀' : '🔄'}
                    </span>{' '}
                    {e.detail}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Action Bar — shown when simulation is complete and not running */}
      {isComplete && !isRunning && (
        <div className="glass-panel" style={{ padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: 'auto' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Extra iterations:</label>
            <input
              type="number"
              min={1}
              max={200}
              value={extraIterations}
              onChange={e => setExtraIterations(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              style={{
                width: '70px', padding: '0.35rem 0.5rem', borderRadius: '6px',
                border: '1px solid var(--glass-border)', background: 'var(--panel-alpha-10)',
                color: 'var(--color-bright)', fontSize: '0.9rem', textAlign: 'center',
              }}
            />
          </div>

          {['simulating', 'simulation-paused', 'simulation-complete'].includes(sessionStage) ? (
            <>
              <button
                className="btn-primary"
                onClick={async () => {
                  if (!id) return;
                  sseCleanupRef.current?.();
                  sseCleanupRef.current = await continueSimulation(id, extraIterations);
                  setSessionStage('simulating');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Play size={16} /> Add More Iterations
              </button>
              <button
                className="btn-secondary"
                onClick={async () => {
                  if (!id) return;
                  await fetch(`/api/sessions/${id}/stage`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stage: 'reflecting' }),
                  });
                  navigate(`/session/${id}/reflection`);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <ArrowRight size={16} /> Proceed to Reflection
              </button>
            </>
          ) : (
            <button
              className="btn-primary"
              onClick={async () => {
                if (!id) return;
                const newId = await forkSimulation(id);
                navigate(`/session/${newId}/simulation`);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <GitFork size={16} /> Fork & Continue
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface StatCardProps {
  label: string;
  color: string;
  icon: React.ReactNode;
  avg: number;
  min: number;
  max: number;
  history: number[];
}

function StatCard({ label, color, icon, avg, min, max, history }: StatCardProps) {
  const maxHistory = 12;
  const recent = history.slice(-maxHistory);
  const peak = Math.max(...recent, 1);

  return (
    <div style={{ background: 'var(--panel-alpha-05)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', color, marginBottom: '0.5rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>{icon} {label}</span>
        <span>Avg: {avg}</span>
      </div>
      <div style={{ height: '30px', borderBottom: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
        {recent.map((v, i) => (
          <div key={i} style={{ flex: 1, background: color, height: `${Math.round((v / peak) * 100)}%`, opacity: 0.6, minHeight: '2px' }} />
        ))}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textAlign: 'right' as const, marginTop: '0.5rem' }}>
        min {min} / max {max}
      </div>
    </div>
  );
}

export default Simulation;
