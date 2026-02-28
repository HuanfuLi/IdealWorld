import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Send, CheckSquare, Square, Bot } from 'lucide-react';

const Brainstorming = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const chatEndRef = useRef<HTMLDivElement>(null);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([
        {
            role: 'agent',
            content: "Interesting — you want to simulate a communist society. Let me ask a few questions:\n\n1. Is there a central governing body?\n2. What era or technology level?\n3. Are there external pressures?"
        },
        {
            role: 'user',
            content: "There's a central council of 5 elected members. Technology is modern-day. The society is isolated on a large island."
        },
        {
            role: 'agent',
            content: "Great details! A few more questions to help flesh this out:\n\n1. How is dissent handled?\n2. What is the primary economic output of the island?\n3. How are roles assigned to citizens?"
        }
    ]);
    const [showButton, setShowButton] = useState(false);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (!input.trim()) return;
        setMessages([...messages, { role: 'user', content: input }]);
        setInput('');
        setTimeout(() => {
            setMessages(m => [...m, { role: 'agent', content: "Got it. I have enough to begin defining the initial state of the society. We can proceed to design the rules and generate the agent roster." }]);
            setShowButton(true);
        }, 1000);
    };

    return (
        <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header" style={{ marginBottom: '1rem' }}>
                <h1 className="page-title" style={{ fontSize: '1.5rem' }}>Brainstorming</h1>
                <div className="badge badge-info"><Bot size={14} /> Central Agent</div>
            </div>

            <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Chat Area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                {msg.role === 'user' ? '👤' : '🤖'}
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
                                lineHeight: 1.5
                            }}>
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <div style={{ padding: '1.5rem', borderTop: '1px solid var(--glass-border)', background: 'var(--panel-dark-20)' }}>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <input
                            type="text"
                            className="input-glass"
                            placeholder="Type your response..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                        />
                        <button className="btn-secondary" onClick={handleSend} style={{ width: '50px', justifyContent: 'center', padding: 0 }}>
                            <Send size={18} />
                        </button>
                        {showButton && (
                            <button className="btn-primary animate-fade-in" onClick={() => navigate(`/session/${id}/design`)} style={{ whiteSpace: 'nowrap' }}>
                                Start Design <ArrowRight size={18} />
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CheckSquare size={14} /> Governance</span>
                        <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><CheckSquare size={14} /> Economy</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Square size={14} /> Legal</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Square size={14} /> Culture</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Square size={14} /> Infrastructure</span>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Brainstorming;
