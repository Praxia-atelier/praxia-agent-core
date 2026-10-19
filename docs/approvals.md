# Human approval

## Policies

| Policy | Meaning | Typical examples |
|---|---|---|
| `AUTO` | Safe to run without a human | Classify, extract, look up, create a draft record |
| `REQUIRES_APPROVAL` | A human approves each call | Send an email, save a quote for sending |
| `MANUAL_ONLY` | Never automated | Change a price, issue a refund, delete data |

The runtime enforces the policy before calling `execute`. A `MANUAL_ONLY` tool's `execute` is never called; the attempt is audited and listed in `result.manualActions` so a person can follow up.

## Overrides

```ts
createRuntime({
  router,
  policyOverrides: { 'create-record': 'REQUIRES_APPROVAL' },
});
```

Overrides can only make a policy stricter. Setting a `MANUAL_ONLY` tool to `AUTO` has no effect.

## Approval gates

| Gate | Behavior |
|---|---|
| none configured | Every request is rejected (safe default) |
| `ConsoleApprovalGate` | Asks in the terminal; anything but `y`/`yes` rejects |
| `DeferredApprovalGate` | Records the request and returns `pending`; the run ends as `awaiting_approval` |
| `ScriptedApprovalGate`, `approveAll()`, `rejectAll()` | For tests and demos |

To connect your own review UI, chat or inbox, implement:

```ts
interface ApprovalGate {
  request(request: ApprovalRequest): Promise<ApprovalDecision>;
}
```

The approver sees `request.description`, produced by the tool's `describe(input)`. Keep it specific: what will happen, to whom, for how much.

## Dry run

`createRuntime({ router, dryRun: true })` skips every tool that is not marked `readOnly`, without asking for approval. Use it to test workflows against real inputs safely.
