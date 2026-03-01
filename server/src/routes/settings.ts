import { Router } from 'express';
import { readSettings, writeSettings } from '../settings.js';
import { getProvider, invalidateProvider, createProviderFromSettings } from '../llm/gateway.js';
import type { AppSettings } from '@idealworld/shared';

const router = Router();

// GET /api/settings
router.get('/', (_req, res) => {
  try {
    const s = readSettings();
    res.json({
      provider: s.provider,
      hasApiKey: s.apiKey.length > 0,
      baseUrl: s.baseUrl,
      centralAgentModel: s.centralAgentModel,
      citizenAgentModel: s.citizenAgentModel,
      maxConcurrency: s.maxConcurrency,
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

    // If apiKey field is present but empty/blank and settings already have a key,
    // keep the existing key (don't overwrite with empty from masked UI)
    const current = readSettings();
    if (body.apiKey !== undefined && body.apiKey.trim() === '' && current.apiKey) {
      delete body.apiKey;
    }

    const updated = writeSettings(body);
    invalidateProvider();

    res.json({
      provider: updated.provider,
      hasApiKey: updated.apiKey.length > 0,
      baseUrl: updated.baseUrl,
      centralAgentModel: updated.centralAgentModel,
      citizenAgentModel: updated.citizenAgentModel,
      maxConcurrency: updated.maxConcurrency,
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

    const testSettings: AppSettings = {
      ...saved,
      // Only override fields the body actually provided (non-empty)
      ...(body.provider                       ? { provider: body.provider }                               : {}),
      ...(body.apiKey?.trim()                 ? { apiKey: body.apiKey.trim() }                            : {}),
      ...(body.baseUrl?.trim()                ? { baseUrl: body.baseUrl.trim() }                          : {}),
      ...(body.centralAgentModel?.trim()      ? { centralAgentModel: body.centralAgentModel.trim() }      : {}),
    };

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
