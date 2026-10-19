# Auditability

## Entry format

```json
{
  "workflow_id": "quote-draft",
  "run_id": "5b0c…",
  "event": "service.requested#9f1e…",
  "tool": "save-quote-draft",
  "action": "approval.decision",
  "timestamp": "2026-10-19T08:10:27.834Z",
  "status": "approved",
  "result_summary": "approved by console"
}
```

| Field | Content |
|---|---|
| `workflow_id`, `run_id` | Which workflow and which execution |
| `event` | `<type>#<id>` of the triggering event |
| `agent` / `tool` | Who acted, when applicable |
| `action` | `workflow.start`, `context.load`, `agent.run`, `model.complete`, `approval.request`, `approval.decision`, `tool.execute`, `workflow.end` |
| `timestamp` | ISO 8601 |
| `status` | `started`, `succeeded`, `failed`, `approval_requested`, `approved`, `rejected`, `pending`, `blocked`, `skipped` |
| `result_summary` | Short, non-sensitive description |
| `error` | Redacted error message |

## What is never stored

- Event payloads
- Tool inputs and outputs
- Prompts and model responses
- API keys and credentials

Summaries default to the *shape* of a value (`object{id,total}`), unless the agent, tool or workflow provides `summarize()`. Write summaries that help an operator without exposing personal data: `invoice=PL-2048 total=186.40 EUR`, not the customer's name.

All summaries and errors also pass through `redact()`, which masks email addresses, phone numbers, IBAN-like strings, bearer tokens, private keys and common API key formats. Redaction is a safety net, not a replacement for careful summaries.

## Sinks

- `MemoryAuditLog`: in memory (each run also returns its entries in `result.audit`)
- `JsonlAuditLog(path)`: one JSON object per line
- `FanoutAuditSink([...])`: several sinks at once

Implement `AuditSink.write(entry)` to send entries to your own database or log pipeline.
