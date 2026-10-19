# Inbox agent

`email → classify → invoice / quote request / general → extract → mock record → audit`

```bash
npm run demo:inbox
```

- `classify-email` sorts each fictional email into one of three categories.
- `extract-invoice` / `extract-quote-request` pull structured fields (validated in code).
- `create-record` (`AUTO`) files the result in an in-memory store.
- General messages are left alone.

All emails, companies and amounts are fictional. No mailbox is accessed.
