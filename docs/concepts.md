# Core concepts

Praxia Agent Core separates **what the business needs** from **which model provides it** and from **what is allowed to happen**.

```
BusinessEvent ──► ContextLoader(s) ──► Workflow.run(ctx)
                                          │
                       ctx.agent(agent, input)      ctx.tool(tool, input)
                                │                          │
                         ModelRouter                  Policy check
                                │                  AUTO / APPROVAL / MANUAL
                         ModelProvider                     │
                                                      Tool.execute
                    └──────────── every step ──► AuditSink ◄┘
```

## Event

`createEvent({ type, source, payload })` returns an immutable `BusinessEvent` with an id and timestamp. Workflows can restrict the event types they accept with `accepts`. The payload is available to agents and tools but never written to the audit log.

## Context

A `ContextLoader` has a `name` and a `load(event)` method. A workflow lists its loaders; the runtime runs them in parallel before the workflow body and exposes the results as `ctx.data[name]`. Use loaders for read-only business context such as a customer record or a catalog.

## Router and providers

Agents call `ctx.complete(task, request)` or `ctx.completeJson(task, request)`. The `task` is a name you choose (`classify`, `extract`, `draft`). `BasicRouter` maps each task to an ordered list of provider ids, skips providers that are not configured, and falls back to the next one on error. Each model call is audited with the task, provider and model, never the prompt or the answer.

## Agent

An `Agent<I, O>` has a `name` and `run(input, ctx)`. Agents reason and draft; they have no way to perform side effects through the runtime. Validate model output inside the agent (`parseJsonObject`, `expectOneOf`) and return typed data.

## Tool

A `Tool<I, O>` performs an action. It declares:

- `policy`: `AUTO`, `REQUIRES_APPROVAL` or `MANUAL_ONLY`
- `readOnly` (optional): read-only tools still run in dry-run mode
- `describe(input)` (optional): what an approver sees
- `summarize(output)` (optional): a short, non-sensitive audit summary

`ctx.tool(tool, input)` returns a `ToolOutcome`: `executed`, `rejected`, `pending_approval`, `blocked` or `skipped`. Workflows handle each case explicitly.

## Workflow

A workflow is plain async code with an `id`. Keep business logic here and in tools; keep model choice in router configuration.

## Run result

`runtime.run(workflow, event)` returns `status` (`completed`, `awaiting_approval`, `failed`), the workflow `output`, the run's `audit` entries and any `manualActions`. Errors are caught, audited and returned as `failed` with a redacted message.
