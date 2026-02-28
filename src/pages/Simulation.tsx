import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Pause, Square, Activity, Heart, CircleDollarSign, Users } from 'lucide-react';

const Simulation = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [playing, setPlaying] = useState(true);

    // Mock Agent Dots
    const agents = Array(47).fill(0).map((_, i) => ({
        id: i,
        health: i === 12 || i === 8 ? 'critical' : i === 24 ? 'dead' : i % 5 === 0 ? 'struggling' : 'healthy'
    }));

    const getAgentColor = (status: string) => {
        switch (status) {
            case 'healthy': return 'var(--success)';
            case 'struggling': return 'var(--warning)';
            case 'critical': return 'var(--danger)';
            case 'dead': return 'var(--text-dim)';
            default: return 'var(--text-muted)';
        }
    };

    return (
        <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>

            {/* Top Bar: Progress and Controls */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, marginRight: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span><strong style={{ color: 'var(--color-bright)' }}>Iteration 12</strong> of 20</span>
                        <span style={{ color: 'var(--text-dim)' }}>60% • ~8 min remaining</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--panel-alpha-10)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: '60%', background: 'linear-gradient(90deg, var(--primary), var(--success))', transition: 'width 1s linear' }}></div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-secondary" onClick={() => setPlaying(!playing)} style={{ width: '120px', justifyContent: 'center' }}>
                        {playing ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Resume</>}
                    </button>
                    <button className="btn-secondary" style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => navigate(`/session/${id}/reflection`)}>
                        <Square size={18} /> Finish
                    </button>
                </div>
            </div>

            {/* Main Dashboard - Three Columns Option A */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.2fr) minmax(250px, 1fr) minmax(300px, 1fr)', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>

                {/* Col 1: Live Feed */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
                        <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={18} color="var(--primary)" /> Live Feed
                        </h3>
                    </div>
                    <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {[12, 11, 10, 9].map(iter => (
                            <div key={iter} style={{ paddingLeft: '1rem', borderLeft: `2px solid ${iter === 12 ? 'var(--primary)' : 'var(--glass-border)'}` }}>
                                <h4 style={{ fontSize: '0.9rem', color: iter === 12 ? 'var(--primary)' : 'var(--text-muted)', marginBottom: '0.5rem' }}>Iteration {iter}</h4>
                                <p style={{ fontSize: '0.95rem', lineHeight: 1.5, color: '#e5e7eb' }}>
                                    {iter === 12 && "The council debated resource allocation as winter approaches. Farmer Li traded some excess grain secretly."}
                                    {iter === 11 && "A dispute arose between the merchants and the farmers regarding work hours."}
                                    {iter < 11 && "Standard daily operations continued with minor complaints about taxation."}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Col 2: Statistics */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
                        <h3 style={{ fontSize: '1.1rem' }}>Statistics</h3>
                    </div>
                    <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                        <div style={{ background: 'var(--panel-alpha-05)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--warning)', marginBottom: '0.5rem' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CircleDollarSign size={16} /> Wealth</span>
                                <span>Avg: 52</span>
                            </div>
                            <div style={{ height: '30px', borderBottom: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                                {[4, 6, 8, 7, 5, 5, 4, 2, 3].map((h, i) => <div key={i} style={{ flex: 1, background: 'var(--warning)', height: `${h}0%`, opacity: 0.6 }}></div>)}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textAlign: 'right', marginTop: '0.5rem' }}>Gini: 0.31</div>
                        </div>

                        <div style={{ background: 'var(--panel-alpha-05)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)', marginBottom: '0.5rem' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Heart size={16} /> Health</span>
                                <span>Avg: 71</span>
                            </div>
                            <div style={{ height: '30px', borderBottom: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                                {[7, 8, 8, 7, 6, 6, 5, 4, 3].map((h, i) => <div key={i} style={{ flex: 1, background: 'var(--success)', height: `${h}0%`, opacity: 0.6 }}></div>)}
                            </div>
                        </div>

                        <div style={{ background: 'var(--panel-alpha-05)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--primary)', marginBottom: '0.5rem' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Users size={16} /> Population</span>
                                <span>47 alive</span>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Col 3: Agent Grid */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
                        <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Users size={18} /> Agents Status
                        </h3>
                    </div>
                    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem' }}>
                            {agents.map(a => (
                                <div
                                    key={a.id}
                                    style={{
                                        width: '14px', height: '14px',
                                        borderRadius: '50%',
                                        background: getAgentColor(a.health),
                                        boxShadow: '0 0 5px ' + getAgentColor(a.health),
                                        cursor: 'pointer'
                                    }}
                                    title={`Agent ${a.id} - ${a.health}`}
                                ></div>
                            ))}
                        </div>

                        <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '1rem 0' }} />

                        <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase' }}>Lifecycle Logs</h4>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div><span style={{ color: 'var(--text-muted)' }}>Iter 9:</span> Qian Bo died (Starvation)</div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Iter 7:</span> Hu Qiang changed role to Trader</div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Iter 3:</span> Gao Min died (Illness)</div>
                        </div>
                    </div>
                </div>

            </div>
        </div >
    );
};

export default Simulation;
