import React, { useState } from 'react';
import { Search, FileText, Download, Copy, FolderOpen } from 'lucide-react';

const Artifacts = () => {
    const [activeDoc, setActiveDoc] = useState('roster');

    return (
        <div className="animate-fade-in" style={{ height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header" style={{ marginBottom: '1rem' }}>
                <h1 className="page-title" style={{ fontSize: '1.5rem' }}>Session Artifacts</h1>
            </div>

            <div className="glass-panel" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Left Sidebar: Document Tree */}
                <div style={{ width: '280px', borderRight: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', background: 'var(--panel-dark-20)' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                            <input type="text" placeholder="Search..." className="input-glass" style={{ padding: '0.5rem 1rem 0.5rem 2.5rem' }} />
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>

                        <div style={{ padding: '1rem 1rem 0.5rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <FolderOpen size={16} /> Stage 1
                        </div>
                        <div style={{ padding: '0.5rem 1rem 0.5rem 2rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={16} /> Brainstorm Transcript
                        </div>
                        <div
                            onClick={() => setActiveDoc('overview')}
                            style={{ padding: '0.5rem 1rem 0.5rem 2rem', background: activeDoc === 'overview' ? 'var(--panel-alpha-05)' : 'transparent', color: activeDoc === 'overview' ? 'var(--color-bright)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: activeDoc === 'overview' ? '3px solid var(--primary)' : '3px solid transparent' }}>
                            <FileText size={16} /> Society Overview
                        </div>
                        <div
                            onClick={() => setActiveDoc('roster')}
                            style={{ padding: '0.5rem 1rem 0.5rem 2rem', background: activeDoc === 'roster' ? 'var(--panel-alpha-05)' : 'transparent', color: activeDoc === 'roster' ? 'var(--color-bright)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: activeDoc === 'roster' ? '3px solid var(--primary)' : '3px solid transparent' }}>
                            <FileText size={16} /> Agent Roster
                        </div>
                        <div style={{ padding: '0.5rem 1rem 0.5rem 2rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={16} /> Virtual Law
                        </div>

                        <div style={{ padding: '1rem 1rem 0.5rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <FolderOpen size={16} /> Stage 2
                        </div>
                        <div style={{ padding: '0.5rem 1rem 0.5rem 2rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={16} /> Iteration 1-10
                        </div>
                        <div style={{ padding: '0.5rem 1rem 0.5rem 2rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={16} /> Iteration 11-20
                        </div>

                        <div style={{ padding: '1rem 1rem 0.5rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <FolderOpen size={16} /> Stage 3 & 4
                        </div>
                        <div style={{ padding: '0.5rem 1rem 0.5rem 2rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={16} /> Society Eval Report
                        </div>
                        <div style={{ padding: '0.5rem 1rem 0.5rem 2rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={16} /> Agent Reflections
                        </div>
                        <div style={{ padding: '0.5rem 1rem 0.5rem 2rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={16} /> Q&A Transcripts
                        </div>

                    </div>
                </div>

                {/* Right Area: Document Viewer */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

                    <div style={{ padding: '2rem 3rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', color: 'var(--color-bright)' }}>
                                {activeDoc === 'roster' ? 'Agent Roster' : 'Society Overview'}
                            </h2>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                                Generated at: Stage 1B Design
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="btn-secondary" style={{ padding: '0.5rem 1rem' }}><Copy size={16} /> Copy</button>
                            <button className="btn-primary" style={{ padding: '0.5rem 1rem' }}><Download size={16} /> Export Markdown</button>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '3rem', lineHeight: 1.8, fontSize: '1.05rem', color: 'var(--text-muted)' }}>

                        {activeDoc === 'roster' && (
                            <div className="animate-fade-in">
                                <h1 style={{ color: 'var(--color-bright)', fontSize: '2rem', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>Agent Roster <span style={{ color: 'var(--text-dim)', fontSize: '1.25rem' }}>(47 agents)</span></h1>

                                <h3 style={{ color: 'var(--primary)', fontSize: '1.2rem', marginTop: '2rem', marginBottom: '1rem' }}>1. Li Wei</h3>
                                <p><strong>Role:</strong> Farmer</p>
                                <p><strong>Initial Stats:</strong> W: 40 | H: 80 | Happy: 60</p>
                                <p style={{ marginBottom: '1rem' }}><strong>Background:</strong> A hardworking farmer from the eastern fields who has spent his whole life tilling the soil. He believes in the community but worries about winter yields. He tends to keep his head down but will speak up if his family goes hungry.</p>

                                <h3 style={{ color: 'var(--primary)', fontSize: '1.2rem', marginTop: '3rem', marginBottom: '1rem' }}>2. Chen Ming</h3>
                                <p><strong>Role:</strong> Council Member</p>
                                <p><strong>Initial Stats:</strong> W: 60 | H: 70 | Happy: 75</p>
                                <p style={{ marginBottom: '1rem' }}><strong>Background:</strong> An idealistic politician who genuinely believes in the communist vision. She works long hours drafting resource allocation charts and rarely leaves the council building, leading to a disconnect with the rural workers.</p>

                                <p style={{ marginTop: '3rem', fontStyle: 'italic', color: 'var(--text-dim)' }}>Scroll to view remaining 45 agents...</p>
                            </div>
                        )}

                        {activeDoc === 'overview' && (
                            <div className="animate-fade-in">
                                <h1 style={{ color: 'var(--color-bright)', fontSize: '2rem', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>Society Overview</h1>
                                <p><strong>Name:</strong> Communist Village</p>
                                <p><strong>Starting Population:</strong> 47</p>
                                <p style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                                    A society where everyone shares all the resources of the state equitably, governed by a central council of 5 elected members. The society is isolated on a large island with modern-day technology.
                                </p>
                                <h3 style={{ color: 'var(--primary)', fontSize: '1.2rem', marginTop: '2rem', marginBottom: '1rem' }}>Economy</h3>
                                <p>All agricultural and manufactured output is deposited into a central warehouse and distributed weekly based on family size and health needs. There is no formal currency, though shadow-bartering exists.</p>
                            </div>
                        )}

                    </div>
                </div>

            </div>
        </div>
    );
};

export default Artifacts;
