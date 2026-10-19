import { NoProviderAvailableError } from '../core/errors.js';
import type { CompletionRequest, CompletionResult, ModelProvider } from '../providers/types.js';

/**
 * Chooses which provider serves a task. Agents talk to the router, never to
 * a provider directly, so changing vendors is a configuration change.
 */
export interface ModelRouter {
  complete(task: string, request: CompletionRequest): Promise<RoutedResult>;
}

export interface RoutedResult extends CompletionResult {
  /** Providers tried before the one that answered, with their errors. */
  fallbacks: { provider: string; error: string }[];
}

export interface BasicRouterOptions {
  providers: readonly ModelProvider[];
  /** Ordered provider ids per task, e.g. `{ classify: ['openai', 'anthropic'] }`. */
  routes?: Readonly<Record<string, readonly string[]>>;
  /** Order used for tasks without a route. Defaults to registration order. */
  defaultRoute?: readonly string[];
}

/**
 * A deliberately simple router: for each task, try providers in the
 * configured order, skip unavailable ones, fall back on errors.
 */
export class BasicRouter implements ModelRouter {
  readonly #providers: Map<string, ModelProvider>;
  readonly #routes: Readonly<Record<string, readonly string[]>>;
  readonly #defaultRoute: readonly string[];

  constructor(options: BasicRouterOptions) {
    this.#providers = new Map();
    for (const provider of options.providers) {
      if (this.#providers.has(provider.id)) {
        throw new Error(`Duplicate provider id "${provider.id}"`);
      }
      this.#providers.set(provider.id, provider);
    }
    this.#routes = options.routes ?? {};
    this.#defaultRoute = options.defaultRoute ?? [...this.#providers.keys()];

    for (const id of [...Object.values(this.#routes).flat(), ...this.#defaultRoute]) {
      if (!this.#providers.has(id)) throw new Error(`Route references unknown provider "${id}"`);
    }
  }

  /** Provider ids that would be tried for a task, in order. */
  routeFor(task: string): readonly string[] {
    return this.#routes[task] ?? this.#defaultRoute;
  }

  async complete(task: string, request: CompletionRequest): Promise<RoutedResult> {
    const attempts: { provider: string; error: string }[] = [];

    for (const id of this.routeFor(task)) {
      const provider = this.#providers.get(id);
      if (!provider) continue;
      if (!provider.isAvailable()) {
        attempts.push({ provider: id, error: 'not available' });
        continue;
      }
      try {
        const result = await provider.complete({ ...request, task });
        return { ...result, fallbacks: attempts };
      } catch (error) {
        attempts.push({
          provider: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    throw new NoProviderAvailableError(task, attempts);
  }
}
