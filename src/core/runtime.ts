import { randomUUID } from 'node:crypto';
import type { Agent, AgentContext } from '../agents/agent.js';
import { parseJsonObject } from '../agents/agent.js';
import { type ApprovalGate, newApprovalRequest, rejectAll } from '../approval/approval.js';
import { type AuditEntry, type AuditSink, MemoryAuditLog } from '../audit/audit.js';
import { describeShape, redact, truncate } from '../audit/redact.js';
import { type ContextLoader, loadContext, type WorkflowData } from '../context/context.js';
import type { BusinessEvent } from '../events/event.js';
import type { CompletionRequest } from '../providers/types.js';
import type { ModelRouter, RoutedResult } from '../router/router.js';
import type { Tool, ToolContext, ToolOutcome } from '../tools/tool.js';
import { type ActionPolicy, stricterPolicy } from './types.js';

/** What a workflow body can do. */
export interface WorkflowContext extends ToolContext {
  readonly dryRun: boolean;
  /** Run an agent. Audited. */
  agent<I, O>(agent: Agent<I, O>, input: I): Promise<O>;
  /** Ask to use a tool. The runtime applies its policy first. Audited. */
  tool<I, O>(tool: Tool<I, O>, input: I): Promise<ToolOutcome<O>>;
}

/**
 * A business workflow: plain async code that coordinates agents and tools.
 * It names tasks (`classify`, `draft`), never model vendors.
 */
export interface Workflow<O = unknown> {
  readonly id: string;
  readonly description?: string;
  /** Event types this workflow accepts. Empty or omitted accepts any. */
  readonly accepts?: readonly string[];
  /** Context loaders to run before the workflow body. */
  readonly context?: readonly ContextLoader[];
  run(ctx: WorkflowContext): Promise<O>;
  summarize?(output: O): string;
}

export function defineWorkflow<O>(workflow: Workflow<O>): Workflow<O> {
  if (!workflow.id.trim()) throw new TypeError('Workflow id is required');
  return workflow;
}

export type RunStatus = 'completed' | 'awaiting_approval' | 'failed';

export interface RunResult<O> {
  workflowId: string;
  runId: string;
  status: RunStatus;
  output?: O;
  error?: string;
  /** Audit entries written during this run. */
  audit: AuditEntry[];
  /** Tool calls that were blocked by MANUAL_ONLY and need a human. */
  manualActions: { tool: string; description: string }[];
}

export interface RuntimeOptions {
  router: ModelRouter;
  /** Where approval requests go. Defaults to rejecting everything (safe). */
  approvals?: ApprovalGate;
  /** Extra audit sinks. Each run also collects its own entries in memory. */
  audit?: AuditSink;
  /**
   * Per-tool policy overrides. They can only make a policy stricter, so a
   * deployment can lock tools down without editing code.
   */
  policyOverrides?: Readonly<Record<string, ActionPolicy>>;
  /** When true, tools that are not read-only are skipped. */
  dryRun?: boolean;
  clock?: () => Date;
}

/**
 * The runtime: Event → Context → Router → Agent → Tool → Action → Audit → Result.
 */
export class Runtime {
  readonly #router: ModelRouter;
  readonly #approvals: ApprovalGate;
  readonly #audit: AuditSink | undefined;
  readonly #overrides: Readonly<Record<string, ActionPolicy>>;
  readonly #dryRun: boolean;
  readonly #clock: () => Date;

  constructor(options: RuntimeOptions) {
    this.#router = options.router;
    this.#approvals = options.approvals ?? rejectAll('default-gate');
    this.#audit = options.audit;
    this.#overrides = options.policyOverrides ?? {};
    this.#dryRun = options.dryRun ?? false;
    this.#clock = options.clock ?? (() => new Date());
  }

  /** The policy that will actually be enforced for a tool. */
  effectivePolicy(tool: Tool<never, unknown>): ActionPolicy {
    const override = this.#overrides[tool.name];
    return override ? stricterPolicy(tool.policy, override) : tool.policy;
  }

  async run<O>(workflow: Workflow<O>, event: BusinessEvent): Promise<RunResult<O>> {
    const runId = randomUUID();
    const memory = new MemoryAuditLog();
    const manualActions: RunResult<O>['manualActions'] = [];
    let pendingApprovals = 0;

    const write = async (
      entry: Omit<AuditEntry, 'workflow_id' | 'run_id' | 'event' | 'timestamp'>,
    ) => {
      const full: AuditEntry = {
        workflow_id: workflow.id,
        run_id: runId,
        event: `${event.type}#${event.id}`,
        timestamp: this.#clock().toISOString(),
        ...entry,
        ...(entry.result_summary ? { result_summary: safe(entry.result_summary) } : {}),
        ...(entry.error ? { error: safe(entry.error) } : {}),
      };
      await memory.write(full);
      await this.#audit?.write(full);
    };

    const result = (status: RunStatus, extra: { output?: O; error?: string }): RunResult<O> => ({
      workflowId: workflow.id,
      runId,
      status,
      ...extra,
      audit: memory.entries,
      manualActions,
    });

    await write({
      action: 'workflow.start',
      status: 'started',
      ...(this.#dryRun ? { result_summary: 'dry run' } : {}),
    });

    if (workflow.accepts?.length && !workflow.accepts.includes(event.type)) {
      const error = `Workflow does not accept event type "${event.type}"`;
      await write({ action: 'workflow.end', status: 'failed', error });
      return result('failed', { error: safe(error) });
    }

    try {
      const data = await loadContext(workflow.context ?? [], event);
      if (workflow.context?.length) {
        await write({
          action: 'context.load',
          status: 'succeeded',
          result_summary: `loaded ${Object.keys(data).join(', ')}`,
        });
      }

      const ctx = this.#workflowContext({
        workflowId: workflow.id,
        runId,
        event,
        data,
        write,
        manualActions,
        onPending: () => pendingApprovals++,
      });
      const output = await workflow.run(ctx);

      const status: RunStatus = pendingApprovals > 0 ? 'awaiting_approval' : 'completed';
      await write({
        action: 'workflow.end',
        status: status === 'completed' ? 'succeeded' : 'pending',
        result_summary: workflow.summarize ? workflow.summarize(output) : describeShape(output),
      });
      return result(status, { output });
    } catch (error) {
      const message = errorMessage(error);
      await write({ action: 'workflow.end', status: 'failed', error: message });
      return result('failed', { error: safe(message) });
    }
  }

  #workflowContext(args: {
    workflowId: string;
    runId: string;
    event: BusinessEvent;
    data: WorkflowData;
    write: (
      entry: Omit<AuditEntry, 'workflow_id' | 'run_id' | 'event' | 'timestamp'>,
    ) => Promise<void>;
    manualActions: { tool: string; description: string }[];
    onPending: () => void;
  }): WorkflowContext {
    const { workflowId, runId, event, data, write } = args;
    const toolCtx: ToolContext = { workflowId, runId, event, data };
    const router = this.#router;
    const dryRun = this.#dryRun;
    const approvals = this.#approvals;

    const agentContext = (agentName: string): AgentContext => {
      const complete = async (task: string, request: CompletionRequest): Promise<RoutedResult> => {
        try {
          const routed = await router.complete(task, request);
          const fallback = routed.fallbacks.length
            ? ` after fallback from ${routed.fallbacks.map((f) => f.provider).join(',')}`
            : '';
          await write({
            agent: agentName,
            action: 'model.complete',
            status: 'succeeded',
            result_summary: `task=${task} provider=${routed.provider} model=${routed.model}${fallback}`,
          });
          return routed;
        } catch (error) {
          await write({
            agent: agentName,
            action: 'model.complete',
            status: 'failed',
            error: errorMessage(error),
          });
          throw error;
        }
      };
      return {
        workflowId,
        runId,
        event,
        data,
        complete,
        async completeJson<T>(task: string, request: CompletionRequest) {
          const routed = await complete(task, { ...request, responseFormat: 'json' });
          return parseJsonObject<T>(routed.text);
        },
      };
    };

    return {
      ...toolCtx,
      dryRun,

      agent: async <I, O>(agent: Agent<I, O>, input: I): Promise<O> => {
        await write({ agent: agent.name, action: 'agent.run', status: 'started' });
        try {
          const output = await agent.run(input, agentContext(agent.name));
          await write({
            agent: agent.name,
            action: 'agent.run',
            status: 'succeeded',
            result_summary: agent.summarize ? agent.summarize(output) : describeShape(output),
          });
          return output;
        } catch (error) {
          await write({
            agent: agent.name,
            action: 'agent.run',
            status: 'failed',
            error: errorMessage(error),
          });
          throw error;
        }
      },

      tool: async <I, O>(tool: Tool<I, O>, input: I): Promise<ToolOutcome<O>> => {
        const policy = this.effectivePolicy(tool as Tool<never, unknown>);
        const description = tool.describe ? tool.describe(input) : `Run ${tool.name}`;

        if (policy === 'MANUAL_ONLY') {
          args.manualActions.push({ tool: tool.name, description: safe(description) });
          const reason = 'MANUAL_ONLY: a human must perform this action outside the workflow';
          await write({
            tool: tool.name,
            action: 'tool.execute',
            status: 'blocked',
            result_summary: reason,
          });
          return { status: 'blocked', reason };
        }

        if (dryRun && !tool.readOnly) {
          const reason = 'dry run: side-effecting tools are not executed';
          await write({
            tool: tool.name,
            action: 'tool.execute',
            status: 'skipped',
            result_summary: reason,
          });
          return { status: 'skipped', reason };
        }

        if (policy === 'REQUIRES_APPROVAL') {
          const request = newApprovalRequest({
            workflowId,
            runId,
            tool: tool.name,
            policy,
            description,
          });
          await write({
            tool: tool.name,
            action: 'approval.request',
            status: 'approval_requested',
            result_summary: `approval_id=${request.id}`,
          });
          const decision = await approvals.request(request);

          if (decision.status === 'pending') {
            args.onPending();
            await write({
              tool: tool.name,
              action: 'approval.decision',
              status: 'pending',
              result_summary: `approval_id=${request.id}`,
            });
            return { status: 'pending_approval', approvalId: request.id };
          }
          const by = decision.approver ? ` by ${decision.approver}` : '';
          await write({
            tool: tool.name,
            action: 'approval.decision',
            status: decision.status,
            result_summary: `${decision.status}${by}`,
          });
          if (decision.status === 'rejected') {
            return { status: 'rejected', reason: decision.note ?? 'rejected by approver' };
          }
        }

        try {
          const output = await tool.execute(input, toolCtx);
          await write({
            tool: tool.name,
            action: 'tool.execute',
            status: 'succeeded',
            result_summary: tool.summarize ? tool.summarize(output) : describeShape(output),
          });
          return { status: 'executed', output };
        } catch (error) {
          await write({
            tool: tool.name,
            action: 'tool.execute',
            status: 'failed',
            error: errorMessage(error),
          });
          throw error;
        }
      },
    };
  }
}

export function createRuntime(options: RuntimeOptions): Runtime {
  return new Runtime(options);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function safe(text: string): string {
  return truncate(redact(text));
}
