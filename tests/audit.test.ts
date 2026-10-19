import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defineAgent,
  defineTool,
  defineWorkflow,
  describeShape,
  MemoryAuditLog,
  redact,
} from '../src/index.js';
import { fakeKey, runtimeWith, testEvent } from './helpers.js';

describe('redact', () => {
  it('scrubs emails, keys, bearer tokens and phone numbers', () => {
    const input = [
      'contact: someone@company.example',
      `key ${fakeKey('sk-')}`,
      `Authorization: Bearer ${fakeKey('abc')}`,
      'call +34 600 000 000',
      'api_key=hunter2',
    ].join(' | ');
    const out = redact(input);
    assert.ok(!out.includes('someone@company.example'));
    assert.ok(!out.includes(fakeKey('sk-')));
    assert.ok(!out.includes(fakeKey('abc')));
    assert.ok(!out.includes('600 000 000'));
    assert.ok(!out.includes('hunter2'));
  });

  it('keeps ISO dates and ordinary identifiers', () => {
    assert.equal(redact('due 2026-11-15 invoice PL-2048'), 'due 2026-11-15 invoice PL-2048');
  });

  it('describeShape reveals structure, not content', () => {
    assert.equal(describeShape({ email: 'a@b.example', total: 10 }), 'object{email,total}');
    assert.equal(describeShape([1, 2, 3]), 'array(3)');
  });
});

describe('audit trail', () => {
  const secretPayload = {
    customerEmail: 'private.person@customer.example',
    note: 'Personal details that must never be logged',
  };

  const leakyAgent = defineAgent<unknown, { echo: string }>({
    name: 'echo',
    async run(input) {
      return { echo: JSON.stringify(input) };
    },
  });
  const leakyTool = defineTool<unknown, string>({
    name: 'fails-loudly',
    description: 'throws an error containing sensitive data',
    policy: 'AUTO',
    async execute() {
      throw new Error(`failed for private.person@customer.example with ${fakeKey('sk-')}`);
    },
  });

  it('records the required fields for every step', async () => {
    const wf = defineWorkflow({
      id: 'audit-wf',
      run: (ctx) => ctx.agent(leakyAgent, ctx.event.payload),
    });
    const result = await runtimeWith().run(wf, testEvent(secretPayload));
    for (const entry of result.audit) {
      assert.equal(entry.workflow_id, 'audit-wf');
      assert.ok(entry.run_id);
      assert.match(entry.event, /^test\.event#/);
      assert.ok(entry.action);
      assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
      assert.ok(entry.status);
    }
  });

  it('never stores payloads, outputs or secrets', async () => {
    const sink = new MemoryAuditLog();
    const wf = defineWorkflow({
      id: 'leaky',
      async run(ctx) {
        await ctx.agent(leakyAgent, ctx.event.payload);
        return ctx.tool(leakyTool, ctx.event.payload);
      },
    });
    const result = await runtimeWith(undefined, { audit: sink }).run(wf, testEvent(secretPayload));

    assert.equal(result.status, 'failed');
    const serialized =
      JSON.stringify(sink.entries) + JSON.stringify(result.audit) + (result.error ?? '');
    assert.ok(!serialized.includes('private.person@customer.example'));
    assert.ok(!serialized.includes('Personal details'));
    assert.ok(!serialized.includes(fakeKey('sk-')));
    assert.ok(serialized.includes('[REDACTED_EMAIL]'));
  });

  it('rejects events the workflow does not accept', async () => {
    const wf = defineWorkflow({ id: 'picky', accepts: ['other.event'], run: async () => 'x' });
    const result = await runtimeWith().run(wf, testEvent());
    assert.equal(result.status, 'failed');
  });
});
