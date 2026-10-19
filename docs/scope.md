# Scope

Praxia Agent Core is deliberately small. It should stay easy to read in an afternoon.

## In scope

- Core interfaces: events, context, agents, tools, providers, routers, approvals, audit
- A simple, readable workflow runtime
- Basic provider adapters over HTTP
- A basic router with ordered routes and fallback
- Safe defaults: policy enforcement, data-minimal audit, dry run
- Offline examples with fictional data
- Planned: additional connectors (v0.2), persistent run state (v0.2), evaluations (v0.2), a plugin system (v0.3), observability hooks (v0.3)

## Out of scope

These are better handled by your application or by dedicated platforms:

- Hosting, scheduling, queues and distributed execution
- Multi-tenancy, user management and permissions
- Billing and usage metering
- Dashboards and analytics
- Vertical or industry-specific workflows
- Cost- or quality-optimized model selection
- Production integrations with specific SaaS products

Pull requests in these areas will usually be declined to keep the core focused.
