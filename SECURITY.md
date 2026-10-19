# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub's [private vulnerability reporting](https://github.com/praxia-atelier/praxia-agent-core/security/advisories/new). Include a description, the affected version and, if possible, a minimal reproduction that uses `MockProvider` and fictional data.

We aim to acknowledge reports within 5 business days and to agree on a disclosure timeline with you.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

## Security model

Praxia Agent Core is a library. It runs inside your application and inherits its security boundary. What the core guarantees:

- **Policies are enforced by the runtime.** A `MANUAL_ONLY` tool is never executed. A `REQUIRES_APPROVAL` tool runs only after an explicit approval. Policy overrides can only tighten.
- **Safe defaults.** With no approval gate configured, approval requests are rejected.
- **Keys stay in the environment.** Provider adapters read keys from environment variables or explicit options. Keys are never written to the audit log or included in error messages.
- **The audit log is data-minimal.** It records event type and id, never payloads, tool inputs or model output. Summaries and errors pass through a redaction filter.

What the core does **not** do, and you must handle:

- **Prompt injection.** Content from emails, forms or web pages can try to steer a model. Treat model output as untrusted input: validate it (see `expectOneOf`, and how the quote example drops unknown catalog items) and keep side effects behind tool policies.
- **Authentication and authorization** of whoever triggers events or approves actions.
- **Storage security** for audit logs and any data your tools write.
- **Redaction completeness.** The redaction filter is a safety net based on patterns. Do not rely on it as your only privacy control.

## Contributor rules

- Never commit API keys, tokens, `.env` files, certificates or credentials. The repository's `.gitignore` and `npm run scan:secrets` help, but they are not a guarantee.
- Never commit real emails, customer data, documents or production logs, including in tests and issues.
