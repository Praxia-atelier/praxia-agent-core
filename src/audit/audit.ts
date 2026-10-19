import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type AuditStatus =
  | 'started'
  | 'succeeded'
  | 'failed'
  | 'approval_requested'
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'blocked'
  | 'skipped';

/**
 * One line in the audit trail. Field names are snake_case so the log reads
 * the same in JSON, SQL or a spreadsheet.
 *
 * By design there is no field for raw input, payloads or model output.
 */
export interface AuditEntry {
  workflow_id: string;
  run_id: string;
  /** `<event type>#<event id>`; never the payload. */
  event: string;
  agent?: string;
  tool?: string;
  /** What happened, e.g. `agent.run`, `model.complete`, `tool.execute`. */
  action: string;
  timestamp: string;
  status: AuditStatus;
  result_summary?: string;
  error?: string;
}

export interface AuditSink {
  write(entry: AuditEntry): Promise<void>;
}

/** Keeps entries in memory. The default sink. */
export class MemoryAuditLog implements AuditSink {
  readonly entries: AuditEntry[] = [];

  async write(entry: AuditEntry): Promise<void> {
    this.entries.push(Object.freeze({ ...entry }));
  }
}

/** Appends one JSON object per line to a local file. */
export class JsonlAuditLog implements AuditSink {
  #ready: Promise<unknown> | undefined;

  constructor(readonly path: string) {}

  async write(entry: AuditEntry): Promise<void> {
    this.#ready ??= mkdir(dirname(this.path), { recursive: true });
    await this.#ready;
    await appendFile(this.path, `${JSON.stringify(entry)}\n`, 'utf8');
  }
}

/** Sends every entry to several sinks. */
export class FanoutAuditSink implements AuditSink {
  constructor(private readonly sinks: readonly AuditSink[]) {}

  async write(entry: AuditEntry): Promise<void> {
    await Promise.all(this.sinks.map((sink) => sink.write(entry)));
  }
}
