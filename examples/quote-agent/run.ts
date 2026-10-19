import { pathToFileURL } from 'node:url';
import { createEvent, createRuntime } from '../../src/index.js';
import { demoApprovals, demoAudit, demoRouter, header, printResult } from '../shared/demo.js';
import { MockQuoteBook, quoteMock, quoteWorkflow, sampleRequest } from './workflow.js';

export async function main() {
  const { router, label } = demoRouter(quoteMock);
  const { gate, label: approvalLabel } = demoApprovals();
  const audit = demoAudit();
  const runtime = createRuntime({ router, approvals: gate, audit: audit.sink });
  const book = new MockQuoteBook();

  header('Quote agent  ·  request → interpret → price (code) → draft → approval → audit', {
    provider: label,
    approvals: approvalLabel,
    data: 'fictional customer and price list',
  });

  const event = createEvent({
    type: 'service.requested',
    source: 'demo-form',
    payload: sampleRequest,
  });
  printResult(await runtime.run(quoteWorkflow(book), event), audit.path);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
