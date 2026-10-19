import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';
import { OpenAIProvider } from './openai.js';
import type { ModelProvider } from './types.js';

/**
 * Builds every built-in HTTP provider. Providers without an API key are
 * still returned but report `isAvailable() === false`, so routers skip them.
 */
export function providersFromEnv(): ModelProvider[] {
  return [new AnthropicProvider(), new OpenAIProvider(), new GoogleProvider()];
}
