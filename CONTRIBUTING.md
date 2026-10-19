# Contributing

Thanks for your interest in Praxia Agent Core. This project aims to stay **small, readable and dependable**, so we are deliberate about what goes in.

## Before you start

- For anything larger than a bug fix or a typo, open an issue first so we can agree on the approach.
- Check [docs/scope.md](docs/scope.md). Features outside that scope will usually be declined, even if they are well built.

## Development

```bash
npm install
npm run check   # lint, typecheck, tests, build, secret scan
npm run demo -- --approve
```

Requirements for every pull request:

- `npm run check` passes.
- New behavior has tests, and the tests run **offline** with `MockProvider`. No test may call a real API.
- **No runtime dependencies.** Dev dependencies need a good reason.
- Public APIs have a short doc comment and, if relevant, an update in `docs/`.
- Code is formatted with Biome (`npm run format`).

## Data rules

These apply to code, tests, examples, issues and pull requests:

- Use **fictional** people, companies, addresses and prices only. Use the reserved `.example` domain for email addresses.
- Never include API keys, tokens, real emails, customer data, documents, screenshots of private systems or production logs.
- If you need a fake key in a test, build it at runtime (see `fakeKey` in `tests/helpers.ts`) so the repository never contains one.

## Commit sign-off

We use the [Developer Certificate of Origin](https://developercertificate.org/). Sign off each commit to certify that you wrote it or have the right to contribute it:

```bash
git commit -s -m "Describe the change"
```

## Adding a provider

Implement `ModelProvider` (`isAvailable()` and `complete()`), read the key from an environment variable, accept an injectable `fetch`, and add tests that use a recording fetch. See `src/providers/anthropic.ts` and `tests/providers.test.ts`.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
