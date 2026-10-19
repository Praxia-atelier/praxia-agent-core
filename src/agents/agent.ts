import type { WorkflowData } from '../context/context.js';
import { AgentOutputError } from '../core/errors.js';
import type { BusinessEvent } from '../events/event.js';
import type { CompletionRequest } from '../providers/types.js';
import type { RoutedResult } from '../router/router.js';

/** What an agent can see and do while it runs. */
export interface AgentContext {
  readonly workflowId: string;
  readonly runId: string;
  readonly event: BusinessEvent;
  readonly data: WorkflowData;
  /** Ask a model through the router. The call is audited. */
  complete(task: string, request: CompletionRequest): Promise<RoutedResult>;
  /** Like `complete`, but requests JSON and parses it. */
  completeJson<T = unknown>(task: string, request: CompletionRequest): Promise<T>;
}

/**
 * An agent turns input into a decision or a draft. Agents reason; they do
 * not act. Side effects belong in tools, where policies apply.
 */
export interface Agent<I = unknown, O = unknown> {
  readonly name: string;
  readonly description?: string;
  run(input: I, ctx: AgentContext): Promise<O>;
  /** Short, non-sensitive description of the output for the audit log. */
  summarize?(output: O): string;
}

export function defineAgent<I, O>(agent: Agent<I, O>): Agent<I, O> {
  if (!agent.name.trim()) throw new TypeError('Agent name is required');
  return agent;
}

/**
 * Parses model output as JSON, tolerating markdown fences and leading prose.
 */
export function parseJsonObject<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start)
    throw new AgentOutputError('Model output contained no JSON object');
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch (cause) {
    throw new AgentOutputError('Model output was not valid JSON', { cause });
  }
}

/** Narrows an unknown value to one of the allowed strings, or throws. */
export function expectOneOf<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value))
    return value as T;
  throw new AgentOutputError(`Field "${field}" must be one of ${allowed.join(', ')}`);
}
