import type { LLMProvider } from './types.js';
import type { AppSettings } from '@idealworld/shared';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider, OpenAICompatibleProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { VertexProvider } from './vertex.js';
import { readSettings } from '../settings.js';

let provider: LLMProvider | null = null;
let citizenProviderCache: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  if (!provider) {
    provider = createProviderFromSettings(readSettings());
  }
  return provider;
}

/** Returns a separate provider for citizen agent tasks if configured, otherwise falls back to main provider. */
export function getCitizenProvider(): LLMProvider {
  const settings = readSettings();
  if (!settings.citizenProvider) {
    // If no separate citizen provider, still ensure we use the citizen model on the main provider
    return createProviderFromSettings(settings, true);
  }
  if (!citizenProviderCache) {
    citizenProviderCache = createProviderFromSettings({
      ...settings,
      provider: settings.citizenProvider,
      apiKey: settings.citizenApiKey ?? '',
      baseUrl: settings.citizenBaseUrl ?? 'http://localhost:1234/v1',
      vertexProjectId: settings.citizenVertexProjectId ?? '',
      vertexLocation: settings.citizenVertexLocation ?? '',
    }, true);
  }
  return citizenProviderCache;
}

export function invalidateProvider(): void {
  provider = null;
  citizenProviderCache = null;
}

/** Create a provider from explicit settings without touching the module-level cache. */
export function createProviderFromSettings(settings: AppSettings, isCitizen = false): LLMProvider {
  const model = isCitizen ? settings.citizenAgentModel : settings.centralAgentModel;

  switch (settings.provider) {
    case 'claude':
      return new AnthropicProvider(settings.apiKey, model);

    case 'openai':
      return new OpenAIProvider(
        settings.apiKey,
        model
      );

    case 'gemini':
      return new GeminiProvider(
        settings.apiKey,
        model
      );

    case 'vertex':
      return new VertexProvider(
        settings.vertexProjectId ?? '',
        settings.vertexLocation ?? '',
        model
      );

    case 'local':
    default:
      // LM Studio / Ollama — API key is not required; use a placeholder so
      // the OpenAI SDK does not fall back to OPENAI_API_KEY env var and throw.
      return new OpenAICompatibleProvider(
        settings.baseUrl || 'http://localhost:1234/v1',
        settings.apiKey || 'lm-studio',
        model
      );
  }
}
