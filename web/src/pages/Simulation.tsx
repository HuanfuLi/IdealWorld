import React, { useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Pause, Square, Activity, Heart, CircleDollarSign, Users, Loader2, AlertCircle } from 'lucide-react';
import { useSimulationStore } from '../stores/simulationStore';
import { useShallow } from 'zustand/react/shallow';
import { useVirtualizer } from '@tanstack/react-virtual';

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
  } = useSimulationStore(useShallow(s => ({
    isRunning: s.isRunning, isPaused: s.isPaused, isComplete: s.isComplete,
    currentIteration: s.currentIteration, totalIterations: s.totalIterations,
    feed: s.feed, statsHistory: s.statsHistory, agents: s.agents,
    finalReport: s.finalReport, error: s.error,
    loadAgents: s.loadAgents, loadHistory: s.loadHistory, connectSSE: s.connectSSE,
    pause: s.pause, resume: s.resume, abort: s.abort, reset: s.reset,
  })));

  useEffect(() => {
    if (!id) return;
    reset();
    loadAgents(id);
    loadHistory(id);
    const disconnect = connectSSE(id);
    return disconnect;
  }, [id]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed.length]);

  // Navigate to reflection when simulation completes
  useEffect(() => {
    if (isComplete && id) {
      // Small delay to let user see the final message
      const t = setTimeout(() => navigate(`/session/${id}/reflection`), 3000);
      return () => clearTimeout(t);
    }
  }, [isComplete, id]);

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

  // Virtualizer for the live feed
  const feedParentRef = useRef<HTMLDivElement>(null);
  const feedVirtualizer = useVirtualizer({
    count: reversedFeed.length,
    getScrollElement: () => feedParentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  // Virtualizer for lifecycle events
  const lifecycleParentRef = useRef<HTMLDivElement>(null);
  const lifecycleVirtualizer = useVirtualizer({
    count: allLifecycleEvents.length,
    getScrollElement: () => lifecycleParentRef.current,
    estimateSize: () => 28,
    overscan: 5,
  });

  return (
    <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>

      {/* Top Bar: Progress and Controls */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, marginRight: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
            {isComplete ? (
              <span style={{ color: 'var(--success)' }}><strong>Simulation Complete</strong> — Proceeding to reflection…</span>
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

        <div style={{ display: 'flex', gap: '1rem' }}>
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
          <div ref={feedParentRef} style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
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
            {/* Virtualized feed list */}
            {reversedFeed.length > 0 && (
              <div style={{ height: feedVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
                {feedVirtualizer.getVirtualItems().map(virtualRow => {
                  const entry = reversedFeed[virtualRow.index];
                  return (
                    <div
                      key={entry.number}
                      data-index={virtualRow.index}
                      ref={feedVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingBottom: '1rem',
                      }}
                    >
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
                          {entry.narrativeSummary}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {isComplete && finalReport && (
              <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--success)', marginTop: '0.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--success)', marginBottom: '0.5rem' }}>Final Report</h4>
                <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#e5e7eb', whiteSpace: 'pre-wrap' }}>{finalReport}</p>
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
              <div ref={lifecycleParentRef} style={{ flex: 1, overflowY: 'auto', maxHeight: '300px' }}>
                <div style={{ height: lifecycleVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
                  {lifecycleVirtualizer.getVirtualItems().map(virtualRow => {
                    const e = allLifecycleEvents[virtualRow.index];
                    return (
                      <div
                        key={virtualRow.index}
                        data-index={virtualRow.index}
                        ref={lifecycleVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          fontSize: '0.9rem',
                          color: 'var(--text-dim)',
                          paddingBottom: '0.5rem',
                        }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>Iter {e.iterNum}:</span>{' '}
                        <span style={{ color: e.type === 'death' ? 'var(--danger)' : 'var(--primary)' }}>
                          {e.type === 'death' ? '💀' : '🔄'}
                        </span>{' '}
                        {e.detail}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
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
