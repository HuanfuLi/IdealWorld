import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Play, Users, Clock, Settings, ArrowRight } from 'lucide-react';

const HomePage = () => {
    const navigate = useNavigate();

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <h1 className="page-title">Your Societies</h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-secondary" onClick={() => navigate('/compare')}>
                        <Users size={18} /> Compare Sessions
                    </button>
                    <button className="btn-primary" onClick={() => navigate('/session/new/idea')}>
                        <Plus size={18} /> New Session
                    </button>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* Card 1 */}
                <div className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.25rem', color: 'var(--color-bright)' }}>Communist Village</h3>
                        <span className="badge badge-success">✓ Completed</span>
                    </div>
                    <p className="text-muted" style={{ marginBottom: '1.5rem', minHeight: '48px' }}>
                        "A society where everyone shares all the resources of the state equitably..."
                    </p>
                    <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Users size={16} /> 47 agents
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Clock size={16} /> 20 iter
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Feb 25, 2026</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn-secondary" style={{ padding: '0.5rem' }} onClick={() => navigate('/session/1/reflection')} title="Resume">
                                <Play size={16} />
                            </button>
                            <button className="btn-secondary" style={{ padding: '0.5rem', color: 'var(--danger)' }} title="Delete">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Card 2 */}
                <div className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.25rem', color: 'var(--color-bright)' }}>Libertarian City</h3>
                        <span className="badge badge-warning">⏳ Simulating (8/15)</span>
                    </div>
                    <p className="text-muted" style={{ marginBottom: '1.5rem', minHeight: '48px' }}>
                        "Pure free-market with zero government intervention or taxes..."
                    </p>
                    <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Users size={16} /> 85 agents
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Clock size={16} /> 8 iter
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Feb 27, 2026</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn-primary" style={{ padding: '0.5rem' }} onClick={() => navigate('/session/2/simulation')}>
                                <Play size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* New Session Card */}
                <div className="glass-card" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    borderStyle: 'dashed',
                    textAlign: 'center',
                    minHeight: '220px'
                }}
                    onClick={() => navigate('/session/new/idea')}>
                    <div style={{
                        background: 'var(--glass-bg)',
                        padding: '1rem',
                        borderRadius: '50%',
                        marginBottom: '1rem',
                        color: 'var(--primary)'
                    }}>
                        <Plus size={32} />
                    </div>
                    <h3 style={{ color: 'var(--color-bright)', marginBottom: '0.5rem' }}>New Session</h3>
                    <p className="text-muted" style={{ fontSize: '0.9rem' }}>Click to design a new society</p>
                </div>

            </div>
        </div>
    );
};

export default HomePage;
