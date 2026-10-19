import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sampleEmails } from '../examples/inbox-agent/data.js';
import { inboxMock, inboxWorkflow, MockRecordStore } from '../examples/inbox-agent/workflow.js';
import {
  MockQuoteBook,
  quoteMock,
  quoteWorkflow,
  sampleRequest,
} from '../examples/quote-agent/workflow.js';
import {
  MockOutbox,
  salesMock,
  salesWorkflow,
  sampleLead,
} from '../examples/sales-agent/workflow.js';
import {
  approveAll,
  BasicRouter,
  createEvent,
  createRuntime,
  MockProvider,
  rejectAll,
} from '../src/index.js';

const router = (respond: ConstructorParameters<typeof MockProvider>[0]['respond']) =>
  new BasicRouter({ providers: [new MockProvider({ respond })] });

describe('examples run end to end with the mock provider', () => {
  it('inbox: classifies, extracts and files invoices and quote requests', async () => {
    const store = new MockRecordStore();
    const runtime = createRuntime({ router: router(inboxMock) });
    const categories: string[] = [];
    for (const email of sampleEmails) {
      const event = createEvent({ type: 'email.received', source: 'test', payload: email });
      const result = await runtime.run(inboxWorkflow(store), event);
      assert.equal(result.status, 'completed', result.error ?? '');
      categories.push((result.output as { category: string }).category);
      assert.ok(!JSON.stringify(result.audit).includes(email.from));
    }
    assert.deepEqual(categories, ['invoice', 'quote_request', 'general']);
    assert.equal(store.records.length, 2);
  });

  it('sales: only sends after approval', async () => {
    const event = () => createEvent({ type: 'lead.created', source: 'test', payload: sampleLead });

    const rejectedOutbox = new MockOutbox();
    const rejected = await createRuntime({ router: router(salesMock), approvals: rejectAll() }).run(
      salesWorkflow(rejectedOutbox),
      event(),
    );
    assert.equal((rejected.output as { delivery: string }).delivery, 'rejected');
    assert.equal(rejectedOutbox.sent.length, 0);

    const approvedOutbox = new MockOutbox();
    const approved = await createRuntime({
      router: router(salesMock),
      approvals: approveAll(),
    }).run(salesWorkflow(approvedOutbox), event());
    assert.equal((approved.output as { delivery: string }).delivery, 'executed');
    assert.equal(approvedOutbox.sent.length, 1);
  });

  it('quote: prices in code, blocks price changes, saves only after approval', async () => {
    const book = new MockQuoteBook();
    const result = await createRuntime({ router: router(quoteMock), approvals: approveAll() }).run(
      quoteWorkflow(book),
      createEvent({ type: 'service.requested', source: 'test', payload: sampleRequest }),
    );
    assert.equal(result.status, 'completed', result.error ?? '');
    const output = result.output as { quote: { subtotal: number; total: number }; saved: string };
    // 4h venue (480) + 60 guests reception (1080) + sound (250) + 3h photographer (270)
    assert.equal(output.quote.subtotal, 2080);
    assert.equal(output.quote.total, 2288);
    assert.equal(output.saved, 'Q-0001');
    assert.deepEqual(
      result.manualActions.map((a) => a.tool),
      ['change-price'],
    );
  });

  it('quote: drops SKUs the model invents', async () => {
    const book = new MockQuoteBook();
    const result = await createRuntime({
      router: router(() => ({ lines: [{ sku: 'free_unicorn', quantity: 1 }], unmatched: [] })),
      approvals: rejectAll(),
    }).run(
      quoteWorkflow(book),
      createEvent({ type: 'service.requested', source: 'test', payload: sampleRequest }),
    );
    const output = result.output as { quote: { lines: unknown[]; notes: string[] } };
    assert.equal(output.quote.lines.length, 0);
    assert.match(output.quote.notes.join(' '), /free_unicorn/);
    assert.equal(book.drafts.length, 0);
  });
});
