import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Send, FileText, Users, Scale, Play } from 'lucide-react';

const DesignReview = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [activeTab, setActiveTab] = useState('agents');
    const [iterations, setIterations] = useState(20);
    const [messages, setMessages] = useState([
        { role: 'agent', content: "Here's the society I've designed. You can ask me to make changes." },
        { role: 'user', content: "Add 10 more farmers." },
        { role: 'agent', content: "Done — added 10 farmers with diverse backgrounds. The roster now has 57 agents." }
    ]);
    const [input, setInput] = useState('');

    const agents = [
        { name: 'Li Wei', role: 'Farmer', w: 40, h: 80, ha: 60 },
        { name: 'Chen Ming', role: 'Council', w: 60, h: 70, ha: 75 },
        { name: 'Zhou Yan', role: 'Teacher', w: 35, h: 85, ha: 70 },
        { name: 'Wang Jun', role: 'Builder', w: 45, h: 90, ha: 55 },
        { name: 'Xu Mei', role: 'Doctor', w: 50, h: 75, ha: 65 },
    ];

    const handleSend = () => {
        if (!input.trim()) return;
        setMessages([...messages, { role: 'user', content: input }]);
        setInput('');
    };

    return (
        <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header" style={{ marginBottom: '1rem' }}>
                <h1 className="page-title" style={{ fontSize: '1.5rem' }}>Design Review</h1>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>

                {/* Left Side: Documents Panel (~60%) */}
                <div className="glass-panel" style={{ flex: 6, display: 'flex', flexDirection: 'column' }}>

                    <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)' }}>
                        <button
                            style={{ flex: 1, padding: '1rem', background: activeTab === 'overview' ? 'var(--panel-alpha-05)' : 'transparent', border: 'none', color: activeTab === 'overview' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', borderBottom: activeTab === 'overview' ? '2px solid var(--primary)' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            onClick={() => setActiveTab('overview')}
                        ><FileText size={18} /> Overview</button>
                        <button
                            style={{ flex: 1, padding: '1rem', background: activeTab === 'agents' ? 'var(--panel-alpha-05)' : 'transparent', border: 'none', color: activeTab === 'agents' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', borderBottom: activeTab === 'agents' ? '2px solid var(--primary)' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            onClick={() => setActiveTab('agents')}
                        ><Users size={18} /> Agents</button>
                        <button
                            style={{ flex: 1, padding: '1rem', background: activeTab === 'law' ? 'var(--panel-alpha-05)' : 'transparent', border: 'none', color: activeTab === 'law' ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', borderBottom: activeTab === 'law' ? '2px solid var(--primary)' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            onClick={() => setActiveTab('law')}
                        ><Scale size={18} /> Law</button>
                    </div>

                    <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                        {activeTab === 'agents' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: '1.1rem' }}>Agent Roster (57 agents)</h3>
                                    <input type="text" placeholder="Search..." className="input-glass" style={{ padding: '0.5rem 1rem', width: '200px' }} />
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
                                        {agents.map((a, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                                <td style={{ padding: '0.75rem' }}>{a.name}</td>
                                                <td style={{ padding: '0.75rem' }}>{a.role}</td>
                                                <td style={{ padding: '0.75rem', color: 'var(--warning)' }}>{a.w}</td>
                                                <td style={{ padding: '0.75rem', color: 'var(--success)' }}>{a.h}</td>
                                                <td style={{ padding: '0.75rem', color: 'var(--primary)' }}>{a.ha}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {activeTab === 'overview' && (
                            <div style={{ lineHeight: 1.8, color: 'var(--text-muted)' }}>
                                <h2 style={{ color: 'var(--color-bright)' }}>Communist Village Overview</h2>
                                <p>A society where everyone shares all the resources of the state equitably...</p>
                            </div>
                        )}

                        {activeTab === 'law' && (
                            <div style={{ lineHeight: 1.8, color: 'var(--text-muted)' }}>
                                <h2 style={{ color: 'var(--color-bright)' }}>The Virtual Law</h2>
                                <p><strong>Article 1:</strong> All land and surplus food belong to the council for redistribution.</p>
                                <p><strong>Article 2:</strong> Workload is assigned dynamically based on seasonal needs.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side: Refinement Chat (~40%) */}
                <div className="glass-panel" style={{ flex: 4, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)', background: 'var(--panel-dark-10)' }}>
                        <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>💬 Refinement Chat</h3>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {messages.map((msg, idx) => (
                            <div key={idx} style={{
                                background: msg.role === 'user' ? 'rgba(79, 70, 229, 0.2)' : 'var(--panel-alpha-05)',
                                border: '1px solid',
                                borderColor: msg.role === 'user' ? 'rgba(79, 70, 229, 0.4)' : 'var(--glass-border)',
                                padding: '0.75rem 1rem',
                                borderRadius: '8px',
                                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                maxWidth: '85%'
                            }}>
                                <span style={{ fontSize: '0.85rem', color: msg.role === 'user' ? 'var(--primary)' : 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>
                                    {msg.role === 'user' ? 'You' : 'Central Agent'}
                                </span>
                                {msg.content}
                            </div>
                        ))}
                    </div>

                    <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="text"
                                className="input-glass"
                                placeholder="Request a change..."
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                            />
                            <button className="btn-secondary" onClick={handleSend} style={{ width: '48px', padding: 0, justifyContent: 'center' }}><Send size={18} /></button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="glass-card" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)' }}>
                        <input type="checkbox" defaultChecked style={{ accentColor: 'var(--success)', width: '18px', height: '18px' }} />
                        I have reviewed the society design
                    </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Iterations:</span>
                        <input type="number" className="input-glass" value={iterations} onChange={e => setIterations(Number(e.target.value))} style={{ width: '80px', padding: '0.5rem' }} min={1} max={100} />
                    </div>

                    <button className="btn-primary" onClick={() => navigate(`/session/${id}/simulation`)}>
                        <Play size={18} /> Start Simulation
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DesignReview;
