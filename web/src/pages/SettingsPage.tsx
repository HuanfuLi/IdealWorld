import React, { useEffect, useRef, useState } from 'react';
import { Server, CheckCircle2, AlertTriangle, Key, XCircle } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import type { AppSettings } from '@idealworld/shared';

type Provider = AppSettings['provider'];

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'claude',  label: 'Claude (Anthropic)' },
  { value: 'openai',  label: 'ChatGPT (OpenAI)' },
  { value: 'gemini',  label: 'Gemini (Google)' },
  { value: 'local',   label: 'Local (LM Studio / Ollama)' },
];

const CLAUDE_MODELS = [
  { value: 'claude-opus-4-6',           label: 'claude-opus-4-6' },
  { value: 'claude-sonnet-4-6',         label: 'claude-sonnet-4-6' },
  { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5' },
];

const OPENAI_MODELS = [
  { value: 'gpt-4o',       label: 'gpt-4o' },
  { value: 'gpt-4o-mini',  label: 'gpt-4o-mini' },
  { value: 'gpt-4-turbo',  label: 'gpt-4-turbo' },
  { value: 'o3-mini',      label: 'o3-mini' },
];

const GEMINI_MODELS = [
  { value: 'gemini-2.0-flash',   label: 'gemini-2.0-flash' },
  { value: 'gemini-1.5-pro',     label: 'gemini-1.5-pro' },
  { value: 'gemini-1.5-flash',   label: 'gemini-1.5-flash' },
];

const DEFAULT_CENTRAL: Record<Provider, string> = {
  claude: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  local:  '',
};

const DEFAULT_CITIZEN: Record<Provider, string> = {
  claude: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
  local:  '',
};

type ProviderConfig = {
  apiKey: string;
  centralAgentModel: string;
  citizenAgentModel: string;
  baseUrl: string;
};

const SettingsPage = () => {
  const { settings, testStatus, testMessage, loadSettings, updateSettings, testConnection } = useSettingsStore();

  const [provider, setProvider]               = useState<Provider>('claude');
  const [apiKey, setApiKey]                   = useState('');
  const [baseUrl, setBaseUrl]                 = useState('http://localhost:1234/v1');
  const [centralAgentModel, setCentralAgent]  = useState('claude-sonnet-4-6');
  const [citizenAgentModel, setCitizenAgent]  = useState('claude-haiku-4-5-20251001');
  const [maxConcurrency, setMaxConcurrency]   = useState(10);
  const [saving, setSaving]                   = useState(false);
  const [saveError, setSaveError]             = useState<string | null>(null);

  // Stores per-provider form values so switching back restores what the user entered
  const savedConfigs = useRef<Partial<Record<Provider, ProviderConfig>>>({});

  useEffect(() => { loadSettings(); }, []);

  useEffect(() => {
    if (!settings) return;
    setProvider(settings.provider);
    setBaseUrl(settings.baseUrl);
    setCentralAgent(settings.centralAgentModel);
    setCitizenAgent(settings.citizenAgentModel);
    setMaxConcurrency(settings.maxConcurrency);
    // Seed the saved config for the active provider from server values
    savedConfigs.current[settings.provider] = {
      apiKey: '',
      centralAgentModel: settings.centralAgentModel,
      citizenAgentModel: settings.citizenAgentModel,
      baseUrl: settings.baseUrl,
    };
  }, [settings]);

  const handleProviderChange = (p: Provider) => {
    // Snapshot current form before switching
    savedConfigs.current[provider] = { apiKey, centralAgentModel, citizenAgentModel, baseUrl };

    // Restore previously entered values, or fall back to defaults
    const saved = savedConfigs.current[p];
    setProvider(p);
    setApiKey(saved?.apiKey ?? '');
    setCentralAgent(saved?.centralAgentModel ?? DEFAULT_CENTRAL[p]);
    setCitizenAgent(saved?.citizenAgentModel ?? DEFAULT_CITIZEN[p]);
    setBaseUrl(saved?.baseUrl ?? 'http://localhost:1234/v1');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const updates: Partial<AppSettings> = {
        provider,
        baseUrl,
        centralAgentModel,
        citizenAgentModel,
        maxConcurrency,
      };
      if (apiKey.trim()) updates.apiKey = apiKey.trim();
      await updateSettings(updates as Parameters<typeof updateSettings>[0]);
      setApiKey('');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const needsApiKey = provider !== 'local';

  const modelOptions =
    provider === 'claude'  ? CLAUDE_MODELS  :
    provider === 'openai'  ? OPENAI_MODELS  :
    provider === 'gemini'  ? GEMINI_MODELS  : null;

  const apiKeyPlaceholder: Record<Provider, string> = {
    claude: 'sk-ant-...',
    openai: 'sk-...',
    gemini: 'AIza...',
    local:  '',
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="glass-panel" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Server size={20} /> LLM Provider Configuration
        </h2>

        {/* Provider selector */}
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {PROVIDERS.map(p => (
            <label key={p.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="provider"
                checked={provider === p.value}
                onChange={() => handleProviderChange(p.value)}
                style={{ accentColor: 'var(--primary)' }}
              />
              {p.label}
            </label>
          ))}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '0 0 2rem' }} />

        <div className="animate-fade-in" style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>

          {/* API Key field (all cloud providers) */}
          {needsApiKey && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                API Key{' '}
                {settings?.hasApiKey && <span style={{ color: 'var(--success)', fontSize: '0.8rem' }}>(saved)</span>}
              </label>
              <div style={{ position: 'relative' }}>
                <Key size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="password"
                  placeholder={settings?.hasApiKey ? '••••••••••••• (leave blank to keep)' : apiKeyPlaceholder[provider]}
                  className="input-glass"
                  style={{ paddingLeft: '3rem' }}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Local endpoint field */}
          {provider === 'local' && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                Endpoint URL <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(e.g. http://127.0.0.1:1234/v1)</span>
              </label>
              <input
                type="text"
                className="input-glass"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:1234/v1"
              />
            </div>
          )}

          {/* Model selectors */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                Central Agent Model
              </label>
              {modelOptions ? (
                <select className="input-glass" value={centralAgentModel} onChange={e => setCentralAgent(e.target.value)}>
                  {modelOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              ) : (
                <input type="text" className="input-glass" placeholder="e.g. liquid/lfm2.5-1.2b"
                  value={centralAgentModel} onChange={e => setCentralAgent(e.target.value)} />
              )}
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                Citizen Agent Model
              </label>
              {modelOptions ? (
                <select className="input-glass" value={citizenAgentModel} onChange={e => setCitizenAgent(e.target.value)}>
                  {modelOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              ) : (
                <input type="text" className="input-glass" placeholder="e.g. liquid/lfm2.5-1.2b"
                  value={citizenAgentModel} onChange={e => setCitizenAgent(e.target.value)} />
              )}
            </div>
          </div>

          {/* Local warning */}
          {provider === 'local' && (
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: '8px', color: 'var(--warning)', display: 'flex', gap: '0.75rem', fontSize: '0.9rem' }}>
              <AlertTriangle size={20} style={{ flexShrink: 0 }} />
              <div>
                <strong>No API key required</strong> — LM Studio and Ollama run locally.<br />
                Set the endpoint to your server's base URL (include <code>/v1</code>).
                Concurrency is typically limited to 1 for local models.
              </div>
            </div>
          )}

          {/* Gemini note */}
          {provider === 'gemini' && (
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '1rem', borderRadius: '8px', color: '#93c5fd', display: 'flex', gap: '0.75rem', fontSize: '0.9rem' }}>
              <Server size={20} style={{ flexShrink: 0 }} />
              <div>
                Get a free API key at <strong>aistudio.google.com</strong>. Uses Google's OpenAI-compatible endpoint.
              </div>
            </div>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '0 0 2rem' }} />

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            Max Concurrent Requests (1–50)
          </label>
          <input type="number" className="input-glass" style={{ maxWidth: '150px' }}
            value={maxConcurrency} onChange={e => setMaxConcurrency(Number(e.target.value))} min={1} max={50} />
        </div>

        {saveError && (
          <div style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.9rem' }}>{saveError}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              className="btn-secondary"
              disabled={testStatus === 'testing'}
              onClick={() => {
                // Pass current form values so the server can test with the
                // live key/provider even before the user clicks Save.
                const overrides: Record<string, string> = { provider, baseUrl, centralAgentModel };
                if (apiKey.trim()) overrides.apiKey = apiKey.trim();
                testConnection(overrides as Parameters<typeof testConnection>[0]);
              }}
            >
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {testStatus === 'success' && (
              <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }} className="animate-fade-in">
                <CheckCircle2 size={18} /> {testMessage}
              </span>
            )}
            {testStatus === 'error' && (
              <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }} className="animate-fade-in">
                <XCircle size={18} /> {testMessage}
              </span>
            )}
          </div>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
