import type { CompletionRequest, CompletionResult, ModelProvider } from './types.js';

export type MockResponder = (
  request: CompletionRequest,
) => string | object | Promise<string | object>;

export interface MockProviderOptions {
  id?: string;
  model?: string;
  /** Produces the reply. Objects are serialized to JSON. */
  respond: MockResponder;
  /** Simulate an outage. */
  available?: boolean;
}

/**
 * A deterministic, offline provider. Use it for tests, demos and CI so that
 * workflows can run without network access or API keys.
 */
export class MockProvider implements ModelProvider {
  readonly id: string;
  readonly model: string;
  readonly calls: CompletionRequest[] = [];
  readonly #respond: MockResponder;
  readonly #available: boolean;

  constructor(options: MockProviderOptions) {
    this.id = options.id ?? 'mock';
    this.model = options.model ?? 'mock-1';
    this.#respond = options.respond;
    this.#available = options.available ?? true;
  }

  isAvailable(): boolean {
    return this.#available;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    this.calls.push(request);
    const reply = await this.#respond(request);
    const text = typeof reply === 'string' ? reply : JSON.stringify(reply);
    return { text, provider: this.id, model: this.model };
  }
}
