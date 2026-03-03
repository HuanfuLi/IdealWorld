import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMOptions, TestConnectionResult } from './types.js';

/**
 * Extract a human-readable error message from Gemini's non-standard error responses.
 * Gemini returns errors as JSON arrays (e.g. [{error:{message:"..."}}]) which the
 * OpenAI SDK cannot parse, resulting in cryptic "(no body)" messages.
 */
function extractGeminiError(err: unknown, baseURL: string): string {
  const msg = err instanceof Error ? err.message : String(err);

  // If the SDK already gave us a useful message, keep it
  if (!msg.includes('(no body)')) return msg;

  // Hint at common issues based on the provider
  if (baseURL.includes('generativelanguage.googleapis.com')) {
    return `Gemini API error (${msg.replace(' (no body)', '')}). ` +
      'This usually means an invalid API key or unsupported model. ' +
      'Verify your API key at aistudio.google.com and check the model name.';
  }

  return msg;
}

export class OpenAICompatibleProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel: string;
  private baseURL: string;

  constructor(baseURL: string, apiKey: string = 'not-needed', defaultModel: string = 'gpt-4o') {
    this.baseURL = baseURL;
    this.client = new OpenAI({ apiKey, baseURL });
    this.defaultModel = defaultModel;
  }

  async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model ?? this.defaultModel,
        max_tokens: options.maxTokens ?? 4096,
        messages: messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : m.content.map(b => b.text).join('\n'),
        })),
      });

      return response.choices[0]?.message?.content ?? '';
    } catch (err) {
      throw new Error(extractGeminiError(err, this.baseURL));
    }
  }

  async *chatStream(messages: LLMMessage[], options: LLMOptions = {}): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: options.model ?? this.defaultModel,
      max_tokens: options.maxTokens ?? 4096,
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content.map(b => b.text).join('\n'),
      })),
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    const start = Date.now();
    const isGemini = this.baseURL.includes('generativelanguage.googleapis.com');

    // For Gemini, use a direct fetch to get the real error body
    if (isGemini) {
      return this.testGeminiConnection(start);
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      const latencyMs = Date.now() - start;
      const model = response.model ?? this.defaultModel;
      return { ok: true, model, latencyMs };
    } catch (err) {
      return {
        ok: false,
        model: this.defaultModel,
        latencyMs: Date.now() - start,
        error: extractGeminiError(err, this.baseURL),
      };
    }
  }

  /** Direct fetch for Gemini test — bypasses OpenAI SDK to get actual error messages */
  private async testGeminiConnection(start: number): Promise<TestConnectionResult> {
    const url = `${this.baseURL.replace(/\/+$/, '')}/chat/completions`;
    const apiKey = (this.client as unknown as { apiKey: string }).apiKey;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.defaultModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say hi' }],
        }),
      });

      const text = await resp.text();
      const latencyMs = Date.now() - start;

      if (!resp.ok) {
        // Parse Gemini's array-wrapped error response
        let errorMsg = `HTTP ${resp.status}`;
        try {
          const parsed = JSON.parse(text);
          const errObj = Array.isArray(parsed) ? parsed[0] : parsed;
          if (errObj?.error?.message) {
            errorMsg = errObj.error.message;
          }
        } catch { /* use generic message */ }
        return { ok: false, model: this.defaultModel, latencyMs, error: errorMsg };
      }

      // Parse success response
      let model = this.defaultModel;
      try {
        const parsed = JSON.parse(text);
        model = parsed.model ?? this.defaultModel;
      } catch { /* keep default */ }

      return { ok: true, model, latencyMs };
    } catch (err) {
      return {
        ok: false,
        model: this.defaultModel,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
