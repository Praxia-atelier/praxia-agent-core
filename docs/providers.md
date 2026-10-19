# Providers

A provider adapter implements one interface:

```ts
interface ModelProvider {
  readonly id: string;     // used in routes
  readonly model: string;  // sent to the vendor API
  isAvailable(): boolean;  // false when unconfigured; routers skip it
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
```

## Built-in adapters

| Class | API | Key | Model | Base URL |
|---|---|---|---|---|
| `AnthropicProvider` | Messages API | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `ANTHROPIC_BASE_URL` |
| `OpenAIProvider` | Chat Completions | `OPENAI_API_KEY` | `OPENAI_MODEL` | `OPENAI_BASE_URL` |
| `GoogleProvider` | Gemini `generateContent` | `GOOGLE_API_KEY` | `GOOGLE_MODEL` | `GOOGLE_BASE_URL` |
| `MockProvider` | none (offline) | none | `mock-1` | none |

Each adapter ships with a default model so the examples work out of the box. Model names change often: set the `*_MODEL` variable to any model your account can use.

Options can also be passed in code (`new OpenAIProvider({ model, baseUrl, timeoutMs, fetch })`). Pass the key in code only if it comes from your own secret manager; never hardcode it.

## Routing

```ts
const router = new BasicRouter({
  providers: [new AnthropicProvider(), new OpenAIProvider(), new GoogleProvider()],
  routes: {
    classify: ['google', 'openai'],
    draft: ['anthropic', 'openai'],
  },
  defaultRoute: ['openai', 'anthropic'],
});
```

The basic router is intentionally simple: ordered lists and fallback. If you need different selection logic, implement `ModelRouter` yourself; the runtime only depends on the interface.

## Writing an adapter

1. Read the key from an environment variable by default, and expose `isAvailable()`.
2. Accept an injectable `fetch` so tests run offline.
3. Support `responseFormat: 'json'` natively if the API allows it, otherwise add an instruction to the system prompt.
4. Never include headers or keys in error messages.
5. Add tests with a recording `fetch` (see `tests/providers.test.ts`).
