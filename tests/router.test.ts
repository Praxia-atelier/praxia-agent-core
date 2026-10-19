import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BasicRouter, MockProvider, NoProviderAvailableError } from '../src/index.js';

const ok = (id: string) => new MockProvider({ id, respond: () => `from ${id}` });
const failing = (id: string) =>
  new MockProvider({
    id,
    respond: () => {
      throw new Error('boom');
    },
  });
const offline = (id: string) => new MockProvider({ id, respond: () => 'x', available: false });

const ask = { messages: [{ role: 'user' as const, content: 'hi' }] };

describe('BasicRouter', () => {
  it('uses the route for a task', async () => {
    const router = new BasicRouter({
      providers: [ok('a'), ok('b')],
      routes: { draft: ['b', 'a'] },
    });
    assert.equal((await router.complete('draft', ask)).provider, 'b');
    assert.equal((await router.complete('other', ask)).provider, 'a');
  });

  it('falls back past unavailable and failing providers', async () => {
    const router = new BasicRouter({ providers: [offline('a'), failing('b'), ok('c')] });
    const result = await router.complete('classify', ask);
    assert.equal(result.provider, 'c');
    assert.deepEqual(
      result.fallbacks.map((f) => f.provider),
      ['a', 'b'],
    );
  });

  it('passes the task name to the provider', async () => {
    const provider = ok('a');
    await new BasicRouter({ providers: [provider] }).complete('extract', ask);
    assert.equal(provider.calls[0]?.task, 'extract');
  });

  it('throws when nothing can serve the task', async () => {
    const router = new BasicRouter({ providers: [offline('a'), failing('b')] });
    await assert.rejects(router.complete('classify', ask), NoProviderAvailableError);
  });

  it('rejects routes to unknown providers at construction', () => {
    assert.throws(() => new BasicRouter({ providers: [ok('a')], routes: { x: ['nope'] } }));
  });
});
