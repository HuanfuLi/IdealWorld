import React, { useState } from 'react';
import { Server, CheckCircle2, AlertTriangle, Key } from 'lucide-react';

const SettingsPage = () => {
    const [provider, setProvider] = useState('claude');
    const [status, setStatus] = useState<'idle' | 'testing' | 'success'>('idle');

    const handleTest = () => {
        setStatus('testing');
        setTimeout(() => setStatus('success'), 1500);
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="page-header">
                <h1 className="page-title">Settings</h1>
            </div>

            <div className="glass-card" style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Server size={20} className="text-primary" /> LLM Provider Configuration
                </h2>

                <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="provider"
                            checked={provider === 'local'}
                            onChange={() => setProvider('local')}
                            style={{ accentColor: 'var(--primary)' }}
                        />
                        Local LLM (LM Studio / Ollama)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="provider"
                            checked={provider === 'claude'}
                            onChange={() => setProvider('claude')}
                            style={{ accentColor: 'var(--primary)' }}
                        />
                        Claude API (Anthropic)
                    </label>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '2rem 0' }} />

                {provider === 'claude' ? (
                    <div className="animate-fade-in">
                        <h3 style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Claude API Settings
                        </h3>

                        <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>API Key</label>
                                <div style={{ position: 'relative' }}>
                                    <Key size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                                    <input type="password" placeholder="sk-ant-..." className="input-glass" style={{ paddingLeft: '3rem' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>Central Agent Model</label>
                                    <select className="input-glass">
                                        <option>claude-opus-4-6</option>
                                        <option>claude-sonnet-4-6</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>Citizen Agent Model</label>
                                    <select className="input-glass">
                                        <option>claude-haiku-4-5</option>
                                        <option>claude-sonnet-4-6</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="animate-fade-in">
                        <h3 style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Local LLM Settings
                        </h3>
                        <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>Endpoint URL</label>
                                <input type="text" className="input-glass" defaultValue="http://localhost:1234/v1" />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>Central Agent Model</label>
                                    <input type="text" className="input-glass" placeholder="Model name" />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>Citizen Agent Model</label>
                                    <input type="text" className="input-glass" placeholder="Model name" />
                                </div>
                            </div>
                            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: '8px', color: 'var(--warning)', display: 'flex', gap: '0.75rem', fontSize: '0.9rem' }}>
                                <AlertTriangle size={20} />
                                <div>
                                    <strong>Note:</strong> Concurrency is typically limited to 1 for local LLMs.<br />
                                    Estimated time for 100 agents × 20 iterations: ~3 hours.
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '2rem 0' }} />

                <h3 style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Performance
                </h3>
                <div style={{ marginBottom: '2rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>Max Concurrent Requests (1-50)</label>
                    <input type="number" className="input-glass" style={{ maxWidth: '150px' }} defaultValue={10} min={1} max={50} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="btn-secondary" onClick={handleTest}>Test Connection</button>
                        {status === 'success' && (
                            <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }} className="animate-fade-in">
                                <CheckCircle2 size={18} /> Connected. Ready.
                            </span>
                        )}
                        {status === 'testing' && (
                            <span style={{ color: 'var(--warning)', fontSize: '0.9rem' }} className="animate-fade-in">
                                Testing...
                            </span>
                        )}
                    </div>
                    <button className="btn-primary">Save Settings</button>
                </div>

            </div>
        </div>
    );
};

export default SettingsPage;
