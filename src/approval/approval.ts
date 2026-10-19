import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import type { ActionPolicy } from '../core/types.js';

export interface ApprovalRequest {
  readonly id: string;
  readonly workflowId: string;
  readonly runId: string;
  readonly tool: string;
  readonly policy: ActionPolicy;
  /** Human-readable description of what will happen if approved. */
  readonly description: string;
  readonly requestedAt: string;
}

export type ApprovalDecision =
  | { status: 'approved'; approver?: string; note?: string }
  | { status: 'rejected'; approver?: string; note?: string }
  /** No decision yet. The tool call does not run; the workflow can continue. */
  | { status: 'pending' };

/**
 * Where approval requests go: a terminal, a queue, a chat message, an inbox.
 */
export interface ApprovalGate {
  request(request: ApprovalRequest): Promise<ApprovalDecision>;
}

export function newApprovalRequest(
  fields: Omit<ApprovalRequest, 'id' | 'requestedAt'>,
): ApprovalRequest {
  return Object.freeze({ ...fields, id: randomUUID(), requestedAt: new Date().toISOString() });
}

/** Decides with a function. Useful for tests and scripted demos. */
export class ScriptedApprovalGate implements ApprovalGate {
  readonly requests: ApprovalRequest[] = [];
  constructor(readonly decide: (request: ApprovalRequest) => ApprovalDecision) {}

  async request(request: ApprovalRequest): Promise<ApprovalDecision> {
    this.requests.push(request);
    return this.decide(request);
  }
}

export const approveAll = (approver = 'scripted') =>
  new ScriptedApprovalGate(() => ({ status: 'approved', approver }));

export const rejectAll = (approver = 'scripted') =>
  new ScriptedApprovalGate(() => ({ status: 'rejected', approver }));

/**
 * Records requests and leaves them pending. A real system would surface them
 * in a review UI and resume later; persistence is out of scope for v0.1.
 */
export class DeferredApprovalGate implements ApprovalGate {
  readonly #pending = new Map<string, ApprovalRequest>();

  async request(request: ApprovalRequest): Promise<ApprovalDecision> {
    this.#pending.set(request.id, request);
    return { status: 'pending' };
  }

  pending(): ApprovalRequest[] {
    return [...this.#pending.values()];
  }
}

/** Asks a human in the terminal. Anything other than "y"/"yes" rejects. */
export class ConsoleApprovalGate implements ApprovalGate {
  constructor(
    private readonly io: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream } = {
      input: process.stdin,
      output: process.stdout,
    },
  ) {}

  async request(request: ApprovalRequest): Promise<ApprovalDecision> {
    const rl = createInterface({ input: this.io.input, output: this.io.output });
    try {
      const answer = await rl.question(
        `\n  APPROVAL REQUIRED  ${request.tool}\n  ${request.description}\n  Approve? [y/N] `,
      );
      const approved = /^y(es)?$/i.test(answer.trim());
      return { status: approved ? 'approved' : 'rejected', approver: 'console' };
    } finally {
      rl.close();
    }
  }
}
