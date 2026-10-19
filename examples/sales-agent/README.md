# Sales agent

`lead → mock enrichment → mock CRM context → analysis → email draft → approval → audit`

```bash
npm run demo:sales            # approve or reject in the terminal
npm run demo:sales -- --reject
```

- `enrich-company` is a read-only (`AUTO`) lookup against a fictional directory.
- The CRM history comes from a `staticContext` loader.
- `analyze-lead` proposes an angle and talking points; `draft-email` writes the message.
- `send-email` is `REQUIRES_APPROVAL` and writes to a mock outbox. Nothing is sent.

There is intentionally no lead scoring in this example.
