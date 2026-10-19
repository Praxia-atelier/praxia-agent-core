/**
 * Shared primitives used across the runtime.
 */

/**
 * How much autonomy a tool is granted.
 *
 * - `AUTO`: the runtime executes it immediately (e.g. classify an email).
 * - `REQUIRES_APPROVAL`: a human must approve each call (e.g. send a quote).
 * - `MANUAL_ONLY`: the runtime never executes it; a human must do it outside
 *   the workflow (e.g. change a price). The attempt is audited and reported.
 */
export const ActionPolicy = {
  AUTO: 'AUTO',
  REQUIRES_APPROVAL: 'REQUIRES_APPROVAL',
  MANUAL_ONLY: 'MANUAL_ONLY',
} as const;

export type ActionPolicy = (typeof ActionPolicy)[keyof typeof ActionPolicy];

const POLICY_STRICTNESS: Record<ActionPolicy, number> = {
  AUTO: 0,
  REQUIRES_APPROVAL: 1,
  MANUAL_ONLY: 2,
};

/** Returns the stricter of two policies. Overrides can tighten, never loosen. */
export function stricterPolicy(a: ActionPolicy, b: ActionPolicy): ActionPolicy {
  return POLICY_STRICTNESS[a] >= POLICY_STRICTNESS[b] ? a : b;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
