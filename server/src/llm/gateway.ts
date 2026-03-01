import type { LLMProvider } from './types.js';
import type { AppSettings } from '@idealworld/shared';
import { AnthropicProvider } from './anthropic.js';
import { OpenAICompatibleProvider } from './openai.js';
import { readSettings } from '../settings.js';

let provider: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  if (!provider) {
    provider = createProviderFromSettings(readSettings());
  }
  return provider;
}

export function invalidateProvider(): void {
  provider = null;
}

/** Create a provider from explicit settings without touching the module-level cache. */
export function createProviderFromSettings(settings: AppSettings): LLMProvider {
  switch (settings.provider) {
    case 'claude':
      return new AnthropicProvider(settings.apiKey, settings.centralAgentModel);

    case 'openai':
      return new OpenAICompatibleProvider(
        'https://api.openai.com/v1',
        settings.apiKey,
        settings.centralAgentModel
      );

    case 'gemini':
      // Google Gemini exposes an OpenAI-compatible REST endpoint
      return new OpenAICompatibleProvider(
        'https://generativelanguage.googleapis.com/v1beta/openai/',
        settings.apiKey,
        settings.centralAgentModel
      );

    case 'local':
    default:
      // LM Studio / Ollama — API key is not required; use a placeholder so
      // the OpenAI SDK does not fall back to OPENAI_API_KEY env var and throw.
      return new OpenAICompatibleProvider(
        settings.baseUrl || 'http://localhost:1234/v1',
        settings.apiKey || 'lm-studio',
        settings.centralAgentModel
      );
  }
}
