import type { WorkflowData } from '../context/context.js';
import type { ActionPolicy } from '../core/types.js';
import type { BusinessEvent } from '../events/event.js';

export interface ToolContext {
  readonly workflowId: string;
  readonly runId: string;
  readonly event: BusinessEvent;
  readonly data: WorkflowData;
}

/**
 * A tool performs an action in the outside world: create a record, save a
 * draft, send a message. Every tool declares a policy that the runtime
 * enforces before `execute` is ever called.
 */
export interface Tool<I = unknown, O = unknown> {
  readonly name: string;
  readonly description: string;
  readonly policy: ActionPolicy;
  /** True if the tool only reads. Read-only tools still run in dry-run mode. */
  readonly readOnly?: boolean;
  execute(input: I, ctx: ToolContext): Promise<O>;
  /** What a human approver sees. Keep it short and specific. */
  describe?(input: I): string;
  /** Short, non-sensitive description of the output for the audit log. */
  summarize?(output: O): string;
}

export function defineTool<I, O>(tool: Tool<I, O>): Tool<I, O> {
  if (!tool.name.trim()) throw new TypeError('Tool name is required');
  return tool;
}

/** What happened when a workflow asked to use a tool. */
export type ToolOutcome<O> =
  | { status: 'executed'; output: O }
  | { status: 'rejected'; reason: string }
  | { status: 'pending_approval'; approvalId: string }
  | { status: 'blocked'; reason: string }
  | { status: 'skipped'; reason: string };
