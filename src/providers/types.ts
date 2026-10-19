/**
 * The provider boundary. Workflows and agents never import a vendor SDK:
 * they describe what they need (`CompletionRequest`) and a provider adapter
 * translates it to a specific API.
 */

export type MessageRole = 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
}

export interface CompletionRequest {
  messages: Message[];
  system?: string;
  /** Ask the model for a single JSON object instead of prose. */
  responseFormat?: 'text' | 'json';
  maxTokens?: number;
  temperature?: number;
  /**
   * The logical task this request serves (e.g. `classify`). Set by the router;
   * providers may ignore it. Mock providers use it to pick a scripted answer.
   */
  task?: string;
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ModelProvider {
  /** Stable identifier used in routes, e.g. `anthropic`. */
  readonly id: string;
  /** Model identifier sent to the vendor API. */
  readonly model: string;
  /** False when the provider cannot be used (e.g. no API key). Routers skip it. */
  isAvailable(): boolean;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

/** `fetch`-compatible function, injectable for tests and custom transports. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpProviderOptions {
  /** API key. Defaults to the provider's environment variable. Never hardcode it. */
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
}
