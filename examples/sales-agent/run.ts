import { pathToFileURL } from 'node:url';
import { createEvent, createRuntime } from '../../src/index.js';
import { demoApprovals, demoAudit, demoRouter, header, printResult } from '../shared/demo.js';
import { MockOutbox, salesMock, salesWorkflow, sampleLead } from './workflow.js';

export async function main() {
  const { router, label } = demoRouter(salesMock);
  const { gate, label: approvalLabel } = demoApprovals();
  const audit = demoAudit();
  const runtime = createRuntime({ router, approvals: gate, audit: audit.sink });
  const outbox = new MockOutbox();

  header('Sales agent  ·  lead → enrich → CRM context → analyze → draft → approval → audit', {
    provider: label,
    approvals: approvalLabel,
    data: 'fictional lead, mock CRM, mock outbox',
  });

  const event = createEvent({ type: 'lead.created', source: 'demo-form', payload: sampleLead });
  printResult(await runtime.run(salesWorkflow(outbox), event), audit.path);
  console.log(
    `\nMock outbox: ${outbox.sent.length} message(s) "sent" (nothing left this process).`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
