import { pathToFileURL } from 'node:url';
import { createEvent, createRuntime } from '../../src/index.js';
import { demoApprovals, demoAudit, demoRouter, header, printResult } from '../shared/demo.js';
import { sampleEmails } from './data.js';
import { inboxMock, inboxWorkflow, MockRecordStore } from './workflow.js';

export async function main() {
  const { router, label } = demoRouter(inboxMock);
  const { gate, label: approvalLabel } = demoApprovals();
  const audit = demoAudit();
  const runtime = createRuntime({ router, approvals: gate, audit: audit.sink });
  const store = new MockRecordStore();
  const workflow = inboxWorkflow(store);

  header('Inbox agent  ·  email → classify → extract → record → audit', {
    provider: label,
    approvals: approvalLabel,
    data: 'fictional emails',
  });

  for (const email of sampleEmails) {
    console.log(`\n── ${email.subject}`);
    const event = createEvent({ type: 'email.received', source: 'demo-inbox', payload: email });
    printResult(await runtime.run(workflow, event));
  }
  console.log(`\nMock store now holds ${store.records.length} record(s). Audit log: ${audit.path}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
