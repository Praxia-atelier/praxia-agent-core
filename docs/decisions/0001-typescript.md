# 0001: TypeScript, zero runtime dependencies

**Status:** accepted

## Context

The runtime needs to be easy to adopt in the places business software already runs: web backends, serverless functions, edge runtimes and full-stack frameworks. It also needs to express contracts (agents, tools, policies) clearly.

## Decision

- TypeScript with `strict` mode, ES modules, Node.js 20.12+.
- **No runtime dependencies.** Provider adapters call public HTTP APIs with `fetch` instead of vendor SDKs.
- Tests use the built-in `node:test` runner and run offline.

## Consequences

- Types document the contracts; the public API is small and explicit.
- No vendor SDK is a structural dependency, so swapping or adding providers stays cheap.
- Adapters must track API changes themselves. They are short and covered by request-shape tests.
- A Python package may follow if there is demand; it would mirror the same concepts.
