/** Base class so callers can tell runtime errors apart from their own. */
export class AgentCoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A provider is not configured (for example, its API key env var is missing). */
export class ProviderNotConfiguredError extends AgentCoreError {}

/** A provider call failed (network, HTTP status, malformed response). */
export class ProviderError extends AgentCoreError {
  constructor(
    readonly providerId: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`[${providerId}] ${message}`, options);
  }
}

/** Every provider in a route failed or was unavailable. */
export class NoProviderAvailableError extends AgentCoreError {
  constructor(
    readonly task: string,
    readonly attempts: { provider: string; error: string }[],
  ) {
    const detail = attempts.length
      ? attempts.map((a) => `${a.provider}: ${a.error}`).join('; ')
      : 'no providers registered for this task';
    super(`No provider could handle task "${task}" (${detail})`);
  }
}

/** An agent produced output that does not match what it promised. */
export class AgentOutputError extends AgentCoreError {}
