import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, CheckCircle } from 'lucide-react';

const AgentReview = () => {
    const navigate = useNavigate();
    const chatEndRef = useRef<HTMLDivElement>(null);
    const [activeAgent, setActiveAgent] = useState('Li');
    const [messages, setMessages] = useState([
        { role: 'agent', content: "I spent most of my time in the fields. I followed the rules, but I started to resent how the council members seemed to have lighter workloads..." },
        { role: 'user', content: "Why did you start trading illegally in iteration 5?" },
        { role: 'agent', content: "I didn't see it as illegal. The council's rules about bartering were unclear, and my family was hungry. I did what I had to do." }
    ]);
    const [input, setInput] = useState('');

    const agents = [
        { id: 'Central', name: 'Central Agent', status: 'ai' },
        { id: 'Li', name: 'Li Wei', role: 'Farmer', status: 'healthy' },
        { id: 'Chen', name: 'Chen Ming', role: 'Council', status: 'healthy' },
        { id: 'Zhou', name: 'Zhou Yan', role: 'Teacher', status: 'warning' },
        { id: 'Wang', name: 'Wang Jun', role: 'Builder', status: 'healthy' },
        { id: 'Xu', name: 'Xu Mei', role: 'Doctor', status: 'healthy' },
        { id: 'Hu', name: 'Hu Qiang', role: 'Trader', status: 'danger' },
        { id: 'Qian', name: 'Qian Bo', role: 'Merchant', status: 'dead' }
    ];

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (!input.trim()) return;
        setMessages([...messages, { role: 'user', content: input }]);
        setInput('');
    };

    const currentAgent = agents.find(a => a.id === activeAgent);

    return (
        <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header" style={{ marginBottom: '1rem' }}>
                <h1 className="page-title" style={{ fontSize: '1.5rem' }}>Agent Review</h1>
                <button className="btn-secondary" style={{ color: 'var(--success)' }} onClick={() => navigate('/')}>
                    <CheckCircle size={18} /> End Session
                </button>
            </div>

            <div className="glass-panel" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Left Sidebar: Agent List */}
                <div style={{ width: '280px', borderRight: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', background: 'var(--panel-dark-20)' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
                        <input type="text" placeholder="Search agents..." className="input-glass" style={{ padding: '0.5rem 1rem' }} />
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--panel-alpha-02)' }}>
                            Core
                        </div>
                        {agents.filter(a => a.status === 'ai').map(a => (
                            <div key={a.id}
                                onClick={() => setActiveAgent(a.id)}
                                style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', background: activeAgent === a.id ? 'var(--panel-alpha-05)' : 'transparent', borderLeft: activeAgent === a.id ? '3px solid var(--primary)' : '3px solid transparent' }}>
                                <span style={{ fontSize: '1.2rem' }}>🤖</span> <span style={{ color: activeAgent === a.id ? 'var(--color-bright)' : 'var(--text-muted)' }}>{a.name}</span>
                            </div>
                        ))}

                        <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--panel-alpha-02)' }}>
                            Alive
                        </div>
                        {agents.filter(a => ['healthy', 'warning', 'danger'].includes(a.status)).map(a => (
                            <div key={a.id}
                                onClick={() => setActiveAgent(a.id)}
                                style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', background: activeAgent === a.id ? 'var(--panel-alpha-05)' : 'transparent', borderLeft: activeAgent === a.id ? '3px solid var(--primary)' : '3px solid transparent' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: a.status === 'healthy' ? 'var(--success)' : a.status === 'warning' ? 'var(--warning)' : 'var(--danger)' }}></div>
                                <div style={{ color: activeAgent === a.id ? 'var(--color-bright)' : 'var(--text-muted)' }}>
                                    <div>{a.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{a.role}</div>
                                </div>
                            </div>
                        ))}

                        <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--panel-alpha-02)' }}>
                            Deceased
                        </div>
                        {agents.filter(a => a.status === 'dead').map(a => (
                            <div key={a.id}
                                onClick={() => setActiveAgent(a.id)}
                                style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', background: activeAgent === a.id ? 'var(--panel-alpha-05)' : 'transparent', borderLeft: activeAgent === a.id ? '3px solid var(--text-dim)' : '3px solid transparent', opacity: 0.6 }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--text-dim)' }}></div>
                                <div style={{ color: activeAgent === a.id ? 'var(--color-bright)' : 'var(--text-muted)' }}>
                                    <div>{a.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{a.role}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Area: Chat */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-bright)' }}>Chatting with {currentAgent?.name}</h2>
                        {currentAgent?.role && <span className="badge badge-neutral">{currentAgent.role}</span>}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }} key={activeAgent}>
                        {messages.map((msg, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                gap: '1rem',
                                alignItems: 'flex-start'
                            }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '50%',
                                    background: msg.role === 'user' ? 'var(--primary)' : 'var(--panel-alpha-10)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
                                    flexShrink: 0
                                }}>
                                    {msg.role === 'user' ? '👤' : currentAgent?.status === 'ai' ? '🤖' : '😶'}
                                </div>
                                <div style={{
                                    background: msg.role === 'user' ? 'rgba(79, 70, 229, 0.2)' : 'var(--panel-alpha-05)',
                                    border: '1px solid',
                                    borderColor: msg.role === 'user' ? 'rgba(79, 70, 229, 0.4)' : 'var(--glass-border)',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    borderTopRightRadius: msg.role === 'user' ? 0 : '12px',
                                    borderTopLeftRadius: msg.role === 'agent' ? 0 : '12px',
                                    maxWidth: '75%',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: 1.5,
                                    color: 'var(--text-main)'
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--glass-border)', background: 'var(--panel-dark-20)' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <input
                                type="text"
                                className="input-glass"
                                placeholder={`Ask ${currentAgent?.name.split(' ')[0]} a question...`}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                            />
                            <button className="btn-primary" onClick={handleSend} style={{ width: '50px', justifyContent: 'center', padding: 0 }}>
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default AgentReview;
