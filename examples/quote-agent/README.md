# Quote agent

`service request → interpret → price in code → draft → approval → audit`

```bash
npm run demo:quote
```

- `interpret-request` maps a fictional request to catalog items. Unknown items are dropped and flagged, never invented.
- `price-quote` (`AUTO`, read-only) computes every amount in code from a fictional price list. The model never does arithmetic on money.
- `save-quote-draft` is `REQUIRES_APPROVAL`.
- When the customer asks for a discount, the workflow calls `change-price`, which is `MANUAL_ONLY`: it is blocked, audited and reported as a manual action.

The venue, price list and tax rate are invented for this example.
