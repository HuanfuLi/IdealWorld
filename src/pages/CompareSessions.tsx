import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, MessageSquare } from 'lucide-react';

const CompareSessions = () => {
    const navigate = useNavigate();

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <h1 className="page-title">Compare Sessions</h1>
            </div>

            <div className="glass-card" style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Select sessions to compare:</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--panel-alpha-05)', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--primary)' }}>
                        <input type="checkbox" defaultChecked style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }} />
                        <div style={{ flex: 1 }}>
                            <strong style={{ color: 'var(--color-bright)' }}>Communist Village</strong>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '1rem', fontSize: '0.9rem' }}>(47 agents, 20 iterations, completed)</span>
                        </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--panel-alpha-05)', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--primary)' }}>
                        <input type="checkbox" defaultChecked style={{ accentColor: 'var(--primary)', width: '18px', height: '18px' }} />
                        <div style={{ flex: 1 }}>
                            <strong style={{ color: 'var(--color-bright)' }}>Libertarian City</strong>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '1rem', fontSize: '0.9rem' }}>(85 agents, 15 iterations, completed)</span>
                        </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--panel-alpha-02)', borderRadius: '8px', opacity: 0.5 }}>
                        <input type="checkbox" disabled style={{ width: '18px', height: '18px' }} />
                        <div style={{ flex: 1 }}>
                            <strong>Technocracy 2050</strong>
                            <span style={{ marginLeft: '1rem', fontSize: '0.9rem' }}>(in design — ineligible)</span>
                        </div>
                    </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-primary">Generate Comparison <ArrowRight size={18} /></button>
                </div>
            </div>

            {/* Comparison Report Area */}
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: 'var(--color-bright)' }}>Comparison Report</h2>

            <div style={{ display: 'flex', gap: '2rem', marginBottom: '3rem' }}>

                <div className="glass-card" style={{ flex: 1, borderTop: '4px solid var(--primary)' }}>
                    <h3 style={{ fontSize: '1.25rem', color: 'var(--color-bright)', marginBottom: '1.5rem', textAlign: 'center' }}>Communist Village</h3>
                    <div style={{ display: 'grid', gap: '1rem', color: 'var(--text-main)', fontSize: '1.05rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Avg Wealth:</span> <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>48</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Avg Health:</span> <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>68</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Avg Happiness:</span> <span style={{ fontWeight: 'bold' }}>62</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Gini Coefficient:</span> <span style={{ fontWeight: 'bold' }}>0.31</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Deaths:</span> <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>2</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Survival Rate:</span> <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>96%</span>
                        </div>
                    </div>
                </div>

                <div className="glass-card" style={{ flex: 1, borderTop: '4px solid #f59e0b' }}>
                    <h3 style={{ fontSize: '1.25rem', color: 'var(--color-bright)', marginBottom: '1.5rem', textAlign: 'center' }}>Libertarian City</h3>
                    <div style={{ display: 'grid', gap: '1rem', color: 'var(--text-main)', fontSize: '1.05rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Avg Wealth:</span> <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>67</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Avg Health:</span> <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>59</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Avg Happiness:</span> <span style={{ fontWeight: 'bold' }}>54</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Gini Coefficient:</span> <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>0.58</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Deaths:</span> <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>7</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Survival Rate:</span> <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>92%</span>
                        </div>
                    </div>
                </div>

            </div>

            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--color-bright)', marginBottom: '1rem' }}>Central Analysis</h3>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '1.05rem' }}>
                    The communist society achieved higher equality (Gini 0.31 vs 0.58) and aggregate happiness, but at the cost of lower overall wealth generation and innovation. The libertarian society produced more wealth on average but with extreme inequality — the top 10% of agents held 60% of all resources. This led to a higher mortality rate among the lower economic strata.
                </p>
            </div>

            <div className="glass-card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <input type="text" className="input-glass" placeholder="Ask a follow-up question..." />
                    <button className="btn-secondary" style={{ padding: '0.5rem 1.5rem' }}><MessageSquare size={18} /></button>
                </div>
            </div>
        </div>
    );
};

export default CompareSessions;
