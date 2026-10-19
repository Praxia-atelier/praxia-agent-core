# Examples

| Example | Flow |
|---|---|
| [inbox-agent](inbox-agent) | email → classify → extract → mock record → audit |
| [sales-agent](sales-agent) | lead → enrichment → CRM context → draft → approval → audit |
| [quote-agent](quote-agent) | request → interpret → price in code → draft → approval → audit |

All examples run offline with `MockProvider` by default (`PRAXIA_PROVIDER=mock`).

**All people, companies, email addresses, prices, documents and price lists in these examples are fictional.** Email domains use the reserved `.example` top-level domain. Any resemblance to real people or organizations is coincidental.
