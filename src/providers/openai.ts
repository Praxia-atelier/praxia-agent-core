import { ProviderError } from '../core/errors.js';
import { postJson, requireKey, resolveHttpOptions } from './http.js';
import type {
  CompletionRequest,
  CompletionResult,
  HttpProviderOptions,
  ModelProvider,
} from './types.js';

const ENV = {
  key: 'OPENAI_API_KEY',
  model: 'OPENAI_MODEL',
  baseUrl: 'OPENAI_BASE_URL',
};

/**
 * Adapter for the OpenAI Chat Completions API. Also works with compatible
 * endpoints (set `OPENAI_BASE_URL`).
 */
export class OpenAIProvider implements ModelProvider {
  readonly id = 'openai';
  readonly model: string;
  readonly #opts;

  constructor(options: HttpProviderOptions = {}) {
    this.#opts = resolveHttpOptions(options, ENV, {
      model: 'gpt-5-mini',
      baseUrl: 'https://api.openai.com/v1',
    });
    this.model = this.#opts.model;
  }

  isAvailable(): boolean {
    return Boolean(this.#opts.apiKey);
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const apiKey = requireKey(this.id, this.#opts.apiKey, ENV.key);

    const messages = [
      ...(request.system ? [{ role: 'system', content: request.system }] : []),
      ...request.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const body: Record<string, unknown> = { model: this.model, messages };
    if (request.maxTokens !== undefined) body.max_completion_tokens = request.maxTokens;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.responseFormat === 'json') body.response_format = { type: 'json_object' };

    const data = (await postJson(
      this.id,
      this.#opts,
      `${this.#opts.baseUrl}/chat/completions`,
      { authorization: `Bearer ${apiKey}` },
      body,
    )) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new ProviderError(this.id, 'response contained no text');

    return {
      text,
      provider: this.id,
      model: this.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
    };
  }
}
