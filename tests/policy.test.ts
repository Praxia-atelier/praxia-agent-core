import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type ActionPolicy,
  approveAll,
  DeferredApprovalGate,
  defineTool,
  defineWorkflow,
  rejectAll,
  stricterPolicy,
} from '../src/index.js';
import { runtimeWith, testEvent } from './helpers.js';

function counterTool(policy: ActionPolicy, readOnly = false) {
  const calls: number[] = [];
  const tool = defineTool<number, number>({
    name: `counter-${policy.toLowerCase()}`,
    description: 'test tool',
    policy,
    readOnly,
    async execute(n) {
      calls.push(n);
      return n * 2;
    },
  });
  return { tool, calls };
}

const useTool = (tool: ReturnType<typeof counterTool>['tool']) =>
  defineWorkflow({ id: 'wf', run: (ctx) => ctx.tool(tool, 21) });

describe('action policies', () => {
  it('AUTO executes without asking', async () => {
    const gate = approveAll();
    const { tool, calls } = counterTool('AUTO');
    const result = await runtimeWith(gate).run(useTool(tool), testEvent());
    assert.deepEqual(result.output, { status: 'executed', output: 42 });
    assert.equal(calls.length, 1);
    assert.equal(gate.requests.length, 0);
  });

  it('REQUIRES_APPROVAL executes only when approved', async () => {
    const { tool, calls } = counterTool('REQUIRES_APPROVAL');
    const approved = await runtimeWith(approveAll()).run(useTool(tool), testEvent());
    assert.equal((approved.output as { status: string }).status, 'executed');

    const rejected = await runtimeWith(rejectAll()).run(useTool(tool), testEvent());
    assert.equal((rejected.output as { status: string }).status, 'rejected');
    assert.equal(calls.length, 1);
  });

  it('rejects by default when no approval gate is configured', async () => {
    const { tool, calls } = counterTool('REQUIRES_APPROVAL');
    const result = await runtimeWith().run(useTool(tool), testEvent());
    assert.equal((result.output as { status: string }).status, 'rejected');
    assert.equal(calls.length, 0);
  });

  it('pending approval does not execute and marks the run awaiting_approval', async () => {
    const gate = new DeferredApprovalGate();
    const { tool, calls } = counterTool('REQUIRES_APPROVAL');
    const result = await runtimeWith(gate).run(useTool(tool), testEvent());
    assert.equal(result.status, 'awaiting_approval');
    assert.equal(calls.length, 0);
    assert.equal(gate.pending().length, 1);
  });

  it('MANUAL_ONLY is never executed, even with an approving gate', async () => {
    const gate = approveAll();
    const { tool, calls } = counterTool('MANUAL_ONLY');
    const result = await runtimeWith(gate).run(useTool(tool), testEvent());
    assert.equal((result.output as { status: string }).status, 'blocked');
    assert.equal(calls.length, 0);
    assert.equal(gate.requests.length, 0);
    assert.equal(result.manualActions.length, 1);
    assert.ok(result.audit.some((e) => e.status === 'blocked'));
  });

  it('overrides can tighten a policy but never loosen it', async () => {
    const auto = counterTool('AUTO');
    const tightened = await runtimeWith(rejectAll(), {
      policyOverrides: { [auto.tool.name]: 'REQUIRES_APPROVAL' },
    }).run(useTool(auto.tool), testEvent());
    assert.equal((tightened.output as { status: string }).status, 'rejected');

    const manual = counterTool('MANUAL_ONLY');
    const loosened = await runtimeWith(approveAll(), {
      policyOverrides: { [manual.tool.name]: 'AUTO' },
    }).run(useTool(manual.tool), testEvent());
    assert.equal((loosened.output as { status: string }).status, 'blocked');
    assert.equal(manual.calls.length, 0);
  });

  it('stricterPolicy orders policies', () => {
    assert.equal(stricterPolicy('AUTO', 'MANUAL_ONLY'), 'MANUAL_ONLY');
    assert.equal(stricterPolicy('REQUIRES_APPROVAL', 'AUTO'), 'REQUIRES_APPROVAL');
  });

  it('dry run skips side effects but runs read-only tools', async () => {
    const writer = counterTool('AUTO');
    const reader = counterTool('AUTO', true);
    const runtime = runtimeWith(approveAll(), { dryRun: true });
    const w = await runtime.run(useTool(writer.tool), testEvent());
    const r = await runtime.run(useTool(reader.tool), testEvent());
    assert.equal((w.output as { status: string }).status, 'skipped');
    assert.equal((r.output as { status: string }).status, 'executed');
    assert.equal(writer.calls.length, 0);
  });
});
