import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';

const Reflection = () => {
    const navigate = useNavigate();
    const { id } = useParams();

    return (
        <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header" style={{ marginBottom: '1rem' }}>
                <h1 className="page-title" style={{ fontSize: '1.5rem' }}>Reflection Summary</h1>
                <button className="btn-primary" onClick={() => navigate(`/session/${id}/agents`)}>
                    Review Agents <ArrowRight size={18} />
                </button>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>

                {/* Left Panel: Society Report */}
                <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-bright)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={20} className="text-primary" /> Society Evaluation Report
                        </h2>
                    </div>

                    <div style={{ padding: '2rem', overflowY: 'auto', flex: 1, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        <h3 style={{ color: 'var(--color-bright)', marginBottom: '0.5rem' }}>Overall Verdict</h3>
                        <p style={{ marginBottom: '2rem' }}>
                            This society demonstrated strong communal bonds but suffered from resource allocation inefficiency as the population grew. Despite initial high spirits, the rigid bureaucratic process hampered individual agency.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                                <h4 style={{ color: 'var(--success)', marginBottom: '1rem', fontSize: '1.1rem' }}>Pros</h4>
                                <ul style={{ listStylePosition: 'inside', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
                                    <li>Strong safety net for all</li>
                                    <li>Low crime rate (2 incidents)</li>
                                    <li>High resilience to weather events</li>
                                </ul>
                            </div>
                            <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                                <h4 style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '1.1rem' }}>Cons</h4>
                                <ul style={{ listStylePosition: 'inside', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
                                    <li>Council became a bottleneck</li>
                                    <li>Innovation stifled by rules</li>
                                    <li>3 agents died from targeted famine</li>
                                </ul>
                            </div>
                        </div>

                        <h3 style={{ color: 'var(--color-bright)', marginBottom: '0.5rem' }}>Final Statistics</h3>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                            <div style={{ flex: 1, background: 'var(--panel-alpha-05)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Wealth</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>50 → 48 <TrendingDown size={14} color="var(--danger)" /></div>
                            </div>
                            <div style={{ flex: 1, background: 'var(--panel-alpha-05)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Health</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>75 → 68 <TrendingDown size={14} color="var(--danger)" /></div>
                            </div>
                            <div style={{ flex: 1, background: 'var(--panel-alpha-05)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Happiness</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>60 → 62 <TrendingUp size={14} color="var(--success)" /></div>
                            </div>
                        </div>

                        <h3 style={{ color: 'var(--color-bright)', marginBottom: '0.5rem' }}>Perspective Shifts</h3>
                        <p>
                            After seeing the full picture, 60% of agents softened their criticism. Farmers who felt overlooked were surprised to learn the council had been rationing their own food as well.
                        </p>
                    </div>
                </div>

                {/* Right Panel: Agent Reflections */}
                <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '1.1rem', color: 'var(--color-bright)' }}>Agent Reflections</h2>
                        <select className="input-glass" style={{ width: 'auto', padding: '0.5rem' }}>
                            <option>All Agents</option>
                            <option>Farmers</option>
                            <option>Council</option>
                        </select>
                    </div>
                    <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                        <div className="glass-card" style={{ padding: '1rem', background: 'var(--panel-alpha-02)' }}>
                            <div style={{ color: 'var(--color-bright)', fontWeight: 'bold', marginBottom: '1rem' }}>Li Wei (Farmer)</div>
                            <div style={{ marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pass 1 (Personal Perspective)</span>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
                                    "I worked hard in the fields during the cold, but the system didn't reward effort. We all starved equally."
                                </p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pass 2 (Post-Briefing)</span>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
                                    "I didn't know the council was also rationing their own meals to zero to save us. I feel differently now respecting their sacrifices."
                                </p>
                            </div>
                        </div>

                        <div className="glass-card" style={{ padding: '1rem', background: 'var(--panel-alpha-02)' }}>
                            <div style={{ color: 'var(--color-bright)', fontWeight: 'bold', marginBottom: '1rem' }}>Chen Ming (Council)</div>
                            <div style={{ marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pass 1 (Personal Perspective)</span>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
                                    "It was an impossible task to allocate dwindling resources. The people resented us despite our efforts to maintain order."
                                </p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pass 2 (Post-Briefing)</span>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
                                    "I see now that keeping secrets from the populace made them turn against us. Transparency would have preserved trust."
                                </p>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
};

export default Reflection;
