import { ProviderError } from '../core/errors.js';
import { JSON_INSTRUCTION, postJson, requireKey, resolveHttpOptions } from './http.js';
import type {
  CompletionRequest,
  CompletionResult,
  HttpProviderOptions,
  ModelProvider,
} from './types.js';

const ENV = {
  key: 'ANTHROPIC_API_KEY',
  model: 'ANTHROPIC_MODEL',
  baseUrl: 'ANTHROPIC_BASE_URL',
};

/** Adapter for the Anthropic Messages API. */
export class AnthropicProvider implements ModelProvider {
  readonly id = 'anthropic';
  readonly model: string;
  readonly #opts;

  constructor(options: HttpProviderOptions = {}) {
    this.#opts = resolveHttpOptions(options, ENV, {
      model: 'claude-sonnet-5-5',
      baseUrl: 'https://api.anthropic.com',
    });
    this.model = this.#opts.model;
  }

  isAvailable(): boolean {
    return Boolean(this.#opts.apiKey);
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const apiKey = requireKey(this.id, this.#opts.apiKey, ENV.key);
    const system = [request.system, request.responseFormat === 'json' ? JSON_INSTRUCTION : '']
      .filter(Boolean)
      .join('\n\n');

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: request.maxTokens ?? 1024,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (system) body.system = system;
    if (request.temperature !== undefined) body.temperature = request.temperature;

    const data = (await postJson(
      this.id,
      this.#opts,
      `${this.#opts.baseUrl}/v1/messages`,
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body,
    )) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = (data.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');
    if (!text) throw new ProviderError(this.id, 'response contained no text');

    return {
      text,
      provider: this.id,
      model: this.model,
      usage: { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens },
    };
  }
}
