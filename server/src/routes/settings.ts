import { Router } from 'express';
import { readSettings, writeSettings } from '../settings.js';
import { getProvider, invalidateProvider, createProviderFromSettings } from '../llm/gateway.js';
import type { AppSettings } from '@idealworld/shared';

const router = Router();

// GET /api/settings
router.get('/', (_req, res) => {
  try {
    const s = readSettings();
    const keys = s.apiKeys ?? {};
    res.json({
      provider: s.provider,
      hasApiKey: s.apiKey.length > 0,
      savedApiKeys: {
        claude: !!(keys.claude),
        openai: !!(keys.openai),
        gemini: !!(keys.gemini),
      },
      baseUrl: s.baseUrl,
      centralAgentModel: s.centralAgentModel,
      citizenAgentModel: s.citizenAgentModel,
      maxConcurrency: s.maxConcurrency,
      citizenProvider: s.citizenProvider,
      hasCitizenApiKey: !!(s.citizenApiKey && s.citizenApiKey.length > 0),
      citizenBaseUrl: s.citizenBaseUrl,
    });
  } catch (err) {
    console.error('GET /settings error:', err);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// PUT /api/settings
router.put('/', (req, res) => {
  try {
    const body = req.body as Partial<AppSettings>;

    // If apiKey field is empty and we're staying on the same provider,
    // keep the existing key (don't overwrite with empty from masked UI).
    // But if switching providers, let writeSettings resolve the correct key.
    const current = readSettings();
    const switchingProvider = body.provider && body.provider !== current.provider;
    if (body.apiKey !== undefined && body.apiKey.trim() === '' && current.apiKey && !switchingProvider) {
      delete body.apiKey;
    }
    // Same for citizenApiKey
    if (body.citizenApiKey !== undefined && body.citizenApiKey.trim() === '' && current.citizenApiKey) {
      delete body.citizenApiKey;
    }

    const updated = writeSettings(body);
    invalidateProvider();

    const uKeys = updated.apiKeys ?? {};
    res.json({
      provider: updated.provider,
      hasApiKey: updated.apiKey.length > 0,
      savedApiKeys: {
        claude: !!(uKeys.claude),
        openai: !!(uKeys.openai),
        gemini: !!(uKeys.gemini),
      },
      baseUrl: updated.baseUrl,
      centralAgentModel: updated.centralAgentModel,
      citizenAgentModel: updated.citizenAgentModel,
      maxConcurrency: updated.maxConcurrency,
      citizenProvider: updated.citizenProvider,
      hasCitizenApiKey: !!(updated.citizenApiKey && updated.citizenApiKey.length > 0),
      citizenBaseUrl: updated.citizenBaseUrl,
    });
  } catch (err) {
    console.error('PUT /settings error:', err);
    res.status(500).json({ error: 'Failed to write settings' });
  }
});

// POST /api/settings/test
//
// Accepts an optional JSON body with the same shape as AppSettings.
// Any fields provided in the body override what is on disk — this lets
// the frontend test with a freshly-typed API key before saving.
// The API key from the body is used only for this request; it is never
// persisted.
router.post('/test', async (req, res) => {
  try {
    // Merge saved settings with whatever the UI sent (body wins)
    const saved = readSettings();
    const body = (req.body ?? {}) as Partial<AppSettings>;

    const testProvider = body.provider ?? saved.provider;
    const testSettings: AppSettings = {
      ...saved,
      // Only override fields the body actually provided (non-empty)
      ...(body.provider                       ? { provider: body.provider }                               : {}),
      ...(body.apiKey?.trim()                 ? { apiKey: body.apiKey.trim() }                            : {}),
      ...(body.baseUrl?.trim()                ? { baseUrl: body.baseUrl.trim() }                          : {}),
      ...(body.centralAgentModel?.trim()      ? { centralAgentModel: body.centralAgentModel.trim() }      : {}),
    };

    // Resolve API key for the provider being tested from per-provider storage
    if (!body.apiKey?.trim() && testProvider !== 'local') {
      const savedKeys = saved.apiKeys ?? {};
      testSettings.apiKey = savedKeys[testProvider] ?? '';
    }

    // Validate: cloud providers require an API key
    const needsKey = testSettings.provider !== 'local';
    if (needsKey && !testSettings.apiKey) {
      return res.json({
        ok: false,
        model: testSettings.centralAgentModel,
        latencyMs: 0,
        error: `No API key configured for ${testSettings.provider}. Enter your key and click Test Connection (or Save first).`,
      });
    }

    // Create a temporary provider (does not touch the module-level cache)
    const tempProvider = createProviderFromSettings(testSettings);
    const result = await tempProvider.testConnection();
    res.json(result);
  } catch (err) {
    res.json({
      ok: false,
      model: '',
      latencyMs: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
