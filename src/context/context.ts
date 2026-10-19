import type { BusinessEvent } from '../events/event.js';

/**
 * Loads business context for an event before agents run: a CRM record,
 * an account history, a catalog. Loaders are composable and each one owns
 * a namespace in the workflow context.
 */
export interface ContextLoader<T = unknown> {
  /** Key under which the loaded value is exposed, e.g. `crm`. */
  readonly name: string;
  load(event: BusinessEvent): Promise<T>;
}

export type WorkflowData = Readonly<Record<string, unknown>>;

/** A loader that always returns the same value. Handy for demos and tests. */
export function staticContext<T>(name: string, value: T): ContextLoader<T> {
  return { name, load: async () => value };
}

/** Runs all loaders in parallel and merges results by loader name. */
export async function loadContext(
  loaders: readonly ContextLoader[],
  event: BusinessEvent,
): Promise<WorkflowData> {
  const names = new Set<string>();
  for (const loader of loaders) {
    if (names.has(loader.name)) throw new Error(`Duplicate context loader "${loader.name}"`);
    names.add(loader.name);
  }
  const values = await Promise.all(loaders.map((l) => l.load(event)));
  return Object.freeze(Object.fromEntries(loaders.map((l, i) => [l.name, values[i]])));
}
