# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-19

### Added

- Core interfaces: `BusinessEvent`, `ContextLoader`, `Agent`, `Tool`, `ModelProvider`, `ModelRouter`, `ApprovalGate`, `AuditSink`.
- Workflow runtime with `AUTO`, `REQUIRES_APPROVAL` and `MANUAL_ONLY` policies, tighten-only policy overrides and dry-run mode.
- Provider adapters for Anthropic, OpenAI (and compatible endpoints) and Google Gemini over plain HTTP, plus an offline `MockProvider`.
- `BasicRouter`: ordered provider routes per task with fallback.
- Approval gates: console, deferred (pending), scripted.
- Audit sinks: in-memory, JSONL file, fan-out. Data-minimal entries with redaction.
- Examples: inbox triage, sales follow-up, quote drafting. Fictional data, offline by default.
- CI: lint, typecheck, tests, build, demos, secret scan, dependency audit.
