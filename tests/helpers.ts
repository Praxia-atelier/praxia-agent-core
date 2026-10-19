import {
  type ApprovalGate,
  BasicRouter,
  createEvent,
  createRuntime,
  MockProvider,
  type RuntimeOptions,
} from '../src/index.js';

export function mockRouter(reply: string | object = { ok: true }) {
  return new BasicRouter({ providers: [new MockProvider({ respond: () => reply })] });
}

export function runtimeWith(approvals?: ApprovalGate, extra: Partial<RuntimeOptions> = {}) {
  return createRuntime({ router: mockRouter(), ...(approvals ? { approvals } : {}), ...extra });
}

export const testEvent = (payload: unknown = {}) =>
  createEvent({ type: 'test.event', source: 'tests', payload });

/** Builds a fake key at runtime so the repository never contains one. */
export const fakeKey = (prefix: string, length = 32) => `${prefix}${'x'.repeat(length)}`;
