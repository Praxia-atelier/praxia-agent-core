import { ProviderError } from '../core/errors.js';
import { postJson, requireKey, resolveHttpOptions } from './http.js';
import type {
  CompletionRequest,
  CompletionResult,
  HttpProviderOptions,
  ModelProvider,
} from './types.js';

const ENV = {
  key: 'GOOGLE_API_KEY',
  model: 'GOOGLE_MODEL',
  baseUrl: 'GOOGLE_BASE_URL',
};

/** Adapter for the Google Gemini `generateContent` API. */
export class GoogleProvider implements ModelProvider {
  readonly id = 'google';
  readonly model: string;
  readonly #opts;

  constructor(options: HttpProviderOptions = {}) {
    this.#opts = resolveHttpOptions(options, ENV, {
      model: 'gemini-2.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    });
    this.model = this.#opts.model;
  }

  isAvailable(): boolean {
    return Boolean(this.#opts.apiKey);
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const apiKey = requireKey(this.id, this.#opts.apiKey, ENV.key);

    const generationConfig: Record<string, unknown> = {};
    if (request.maxTokens !== undefined) generationConfig.maxOutputTokens = request.maxTokens;
    if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
    if (request.responseFormat === 'json') generationConfig.responseMimeType = 'application/json';

    const body: Record<string, unknown> = {
      contents: request.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig,
    };
    if (request.system) body.systemInstruction = { parts: [{ text: request.system }] };

    const data = (await postJson(
      this.id,
      this.#opts,
      `${this.#opts.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
      { 'x-goog-api-key': apiKey },
      body,
    )) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');
    if (!text) throw new ProviderError(this.id, 'response contained no text');

    return {
      text,
      provider: this.id,
      model: this.model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
      },
    };
  }
}
