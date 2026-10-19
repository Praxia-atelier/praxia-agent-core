/**
 * Shared plumbing for the demos: pick providers, pick an approval gate,
 * print the result and the audit trail.
 *
 * Every person, company, email address, price and document in the examples
 * is fictional.
 */
import { existsSync } from 'node:fs';
import {
  type ApprovalGate,
  approveAll,
  BasicRouter,
  ConsoleApprovalGate,
  FanoutAuditSink,
  JsonlAuditLog,
  MemoryAuditLog,
  MockProvider,
  type MockResponder,
  type ModelProvider,
  providersFromEnv,
  type RunResult,
  rejectAll,
} from '../../src/index.js';

// Demos read a local .env if present (Node >= 20.12). The library never does.
if (existsSync('.env')) process.loadEnvFile('.env');

/**
 * `PRAXIA_PROVIDER` selects the model provider:
 * - `mock` (default): offline, deterministic, no API key needed
 * - `anthropic` | `openai` | `google`: that provider only
 * - `auto`: every provider with an API key, in that order
 */
export function demoRouter(mockResponder: MockResponder): { router: BasicRouter; label: string } {
  const choice = (process.env.PRAXIA_PROVIDER ?? 'mock').trim().toLowerCase();
  if (choice === 'mock') {
    return {
      router: new BasicRouter({ providers: [new MockProvider({ respond: mockResponder })] }),
      label: 'mock (offline)',
    };
  }

  const all = providersFromEnv();
  const selected: ModelProvider[] =
    choice === 'auto' ? all.filter((p) => p.isAvailable()) : all.filter((p) => p.id === choice);

  if (selected.length === 0) {
    throw new Error(
      choice === 'auto'
        ? 'PRAXIA_PROVIDER=auto but no API key is set. See .env.example.'
        : `Unknown or unconfigured provider "${choice}". Use mock, anthropic, openai, google or auto.`,
    );
  }
  for (const p of selected) {
    if (!p.isAvailable()) throw new Error(`Provider "${p.id}" has no API key. See .env.example.`);
  }
  return {
    router: new BasicRouter({ providers: selected }),
    label: selected.map((p) => `${p.id}:${p.model}`).join(' → '),
  };
}

/**
 * `--approve` approves everything, `--reject` rejects everything. Otherwise
 * the demo asks in the terminal; without a terminal it rejects (safe default).
 */
export function demoApprovals(argv = process.argv): { gate: ApprovalGate; label: string } {
  if (argv.includes('--approve'))
    return { gate: approveAll('demo-flag'), label: 'auto-approve (--approve)' };
  if (argv.includes('--reject'))
    return { gate: rejectAll('demo-flag'), label: 'auto-reject (--reject)' };
  if (process.stdin.isTTY) return { gate: new ConsoleApprovalGate(), label: 'ask in terminal' };
  return { gate: rejectAll('non-interactive'), label: 'reject (no terminal)' };
}

export function demoAudit(): { sink: FanoutAuditSink; path: string } {
  const path = '.praxia/audit.jsonl';
  return { sink: new FanoutAuditSink([new MemoryAuditLog(), new JsonlAuditLog(path)]), path };
}

const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);

export function header(title: string, info: Record<string, string>) {
  console.log(`\n${bold(title)}`);
  for (const [k, v] of Object.entries(info)) console.log(dim(`  ${k.padEnd(10)} ${v}`));
}

export function printResult(result: RunResult<unknown>, auditPath?: string) {
  console.log(`\n${bold('Result')}  status=${result.status}`);
  if (result.error) console.log(`  error: ${result.error}`);
  if (result.output !== undefined) console.log(indent(JSON.stringify(result.output, null, 2)));
  if (result.manualActions.length) {
    console.log(`\n${bold('Manual actions required')}`);
    for (const a of result.manualActions) console.log(`  - ${a.tool}: ${a.description}`);
  }
  console.log(`\n${bold('Audit trail')}`);
  for (const e of result.audit) {
    const who = e.agent ?? e.tool ?? '';
    const detail = e.error ?? e.result_summary ?? '';
    console.log(
      `  ${e.timestamp.slice(11, 23)}  ${e.action.padEnd(18)} ${e.status.padEnd(18)} ${who.padEnd(22)} ${dim(detail)}`,
    );
  }
  if (auditPath) console.log(dim(`\n  Audit log appended to ${auditPath}`));
}

function indent(text: string) {
  return text
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n');
}

/** Pulls the last user message out of a request, for mock responders. */
export function lastUserMessage(messages: { role: string; content: string }[]): string {
  return [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
}
