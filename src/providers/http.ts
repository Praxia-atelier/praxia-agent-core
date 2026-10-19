import { ProviderError, ProviderNotConfiguredError } from '../core/errors.js';
import type { FetchLike, HttpProviderOptions } from './types.js';

export interface ResolvedHttpOptions {
  apiKey: string | undefined;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  fetch: FetchLike;
}

/** Reads options, falling back to environment variables. */
export function resolveHttpOptions(
  options: HttpProviderOptions,
  env: { key: string; model: string; baseUrl: string },
  defaults: { model: string; baseUrl: string },
): ResolvedHttpOptions {
  return {
    apiKey: options.apiKey ?? readEnv(env.key),
    model: options.model ?? readEnv(env.model) ?? defaults.model,
    baseUrl: (options.baseUrl ?? readEnv(env.baseUrl) ?? defaults.baseUrl).replace(/\/+$/, ''),
    timeoutMs: options.timeoutMs ?? 60_000,
    fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
  };
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value?.trim() ? value.trim() : undefined;
}

export function requireKey(providerId: string, apiKey: string | undefined, envName: string) {
  if (!apiKey) {
    throw new ProviderNotConfiguredError(
      `Provider "${providerId}" is not configured. Set ${envName} in your environment.`,
    );
  }
  return apiKey;
}

/**
 * POSTs JSON and returns the parsed body. Error messages include the HTTP
 * status and the vendor's error message, never request headers.
 */
export async function postJson(
  providerId: string,
  opts: ResolvedHttpOptions,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await opts.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (cause) {
    throw new ProviderError(providerId, `request failed: ${describe(cause)}`, { cause });
  }

  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ProviderError(providerId, `HTTP ${response.status}: response was not JSON`);
  }

  if (!response.ok) {
    throw new ProviderError(providerId, `HTTP ${response.status}: ${vendorMessage(parsed)}`);
  }
  return parsed;
}

function vendorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
  }
  return 'unknown error';
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export const JSON_INSTRUCTION =
  'Respond with a single valid JSON object and nothing else. No markdown fences.';
