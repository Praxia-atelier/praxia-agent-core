import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AnthropicProvider,
  type FetchLike,
  GoogleProvider,
  OpenAIProvider,
  ProviderError,
  ProviderNotConfiguredError,
  parseJsonObject,
} from '../src/index.js';
import { fakeKey } from './helpers.js';

function recordingFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

const request = {
  system: 'be brief',
  messages: [{ role: 'user' as const, content: 'hello' }],
  responseFormat: 'json' as const,
};

describe('provider adapters', () => {
  it('Anthropic: builds a Messages API request and reads text blocks', async () => {
    const { fetch, calls } = recordingFetch(200, {
      content: [{ type: 'text', text: '{"a":1}' }],
      usage: { input_tokens: 3, output_tokens: 4 },
    });
    const provider = new AnthropicProvider({ apiKey: fakeKey('k'), model: 'test-model', fetch });
    const result = await provider.complete(request);

    assert.equal(result.text, '{"a":1}');
    assert.equal(calls[0]?.url, 'https://api.anthropic.com/v1/messages');
    const body = JSON.parse(String(calls[0]?.init.body));
    assert.equal(body.model, 'test-model');
    assert.match(body.system, /be brief/);
    assert.match(body.system, /JSON/);
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    assert.equal(headers['x-api-key'], fakeKey('k'));
  });

  it('OpenAI: builds a Chat Completions request with JSON mode', async () => {
    const { fetch, calls } = recordingFetch(200, { choices: [{ message: { content: 'ok' } }] });
    const result = await new OpenAIProvider({ apiKey: fakeKey('k'), fetch }).complete(request);
    assert.equal(result.text, 'ok');
    const body = JSON.parse(String(calls[0]?.init.body));
    assert.equal(body.messages[0].role, 'system');
    assert.deepEqual(body.response_format, { type: 'json_object' });
  });

  it('Google: builds a generateContent request', async () => {
    const { fetch, calls } = recordingFetch(200, {
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    });
    const result = await new GoogleProvider({
      apiKey: fakeKey('k'),
      model: 'g-test',
      fetch,
    }).complete(request);
    assert.equal(result.text, 'ok');
    assert.match(calls[0]?.url ?? '', /models\/g-test:generateContent$/);
    const body = JSON.parse(String(calls[0]?.init.body));
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
  });

  it('reports a missing key by env var name and is unavailable', async () => {
    const provider = new OpenAIProvider({ apiKey: '', fetch: recordingFetch(200, {}).fetch });
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const unconfigured = new OpenAIProvider();
      assert.equal(unconfigured.isAvailable(), false);
      await assert.rejects(unconfigured.complete(request), (error: unknown) => {
        assert.ok(error instanceof ProviderNotConfiguredError);
        assert.match((error as Error).message, /OPENAI_API_KEY/);
        return true;
      });
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
    assert.equal(provider.isAvailable(), false);
  });

  it('HTTP errors carry the vendor message but never the key', async () => {
    const key = fakeKey('sk-');
    const { fetch } = recordingFetch(401, { error: { message: 'invalid api key' } });
    await assert.rejects(
      new AnthropicProvider({ apiKey: key, fetch }).complete(request),
      (error: unknown) => {
        assert.ok(error instanceof ProviderError);
        assert.match((error as Error).message, /401: invalid api key/);
        assert.ok(!(error as Error).message.includes(key));
        return true;
      },
    );
  });
});

describe('parseJsonObject', () => {
  it('handles fences and surrounding prose', () => {
    assert.deepEqual(parseJsonObject('Sure!\n```json\n{"x": 1}\n```'), { x: 1 });
    assert.deepEqual(parseJsonObject('result: {"y": [1,2]} done'), { y: [1, 2] });
  });

  it('throws on non-JSON output', () => {
    assert.throws(() => parseJsonObject('no json here'));
  });
});
