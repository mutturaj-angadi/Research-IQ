import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnswerProviderError, GeminiGenerateContentAnswerGenerator, OpenAICompatibleAnswerGenerator, type AnswerSource } from '../../lib/ai/answerGenerator';

const source: AnswerSource = {
  number: 1,
  title: 'Inter-Satellite Link Configuration',
  chunkId: 'chunk-real-1',
  section: 'Introduction',
  pageNumber: 3,
  content: 'Feasible links satisfy distance and line-of-sight constraints.',
};

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

describe('Gemini GenerateContent answer generator', () => {
  it('sends grounded sources with real chunk IDs and parses non-thought response text', async () => {
    let requestUrl = '';
    let requestHeaders: Headers | undefined;
    let requestBody: Record<string, any> | undefined;
    const generator = new GeminiGenerateContentAnswerGenerator({
      apiKey: 'test-secret', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.8-flash',
      fetchImpl: async (input, init) => {
        requestUrl = String(input);
        requestHeaders = new Headers(init?.headers);
        requestBody = JSON.parse(String(init?.body));
        return response(200, { candidates: [{ content: { parts: [
          { text: 'internal thought', thought: true },
          { text: 'Distance and line of sight constrain feasibility [1].' },
        ] } }] });
      },
      retryDelayMs: 0,
    });

    const answer = await generator.generate('What constrains links?', [source]);
    assert.equal(answer, 'Distance and line of sight constrain feasibility [1].');
    assert.equal(requestUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    assert.equal(requestHeaders?.get('x-goog-api-key'), 'test-secret');
    assert.equal(requestUrl.includes('test-secret'), false);
    assert.equal(requestBody?.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.match(requestBody?.contents[0].parts[0].text, /chunk-real-1/);
    assert.match(requestBody?.systemInstruction.parts[0].text, /ONLY the numbered sources/);
  });

  it('retries a request timeout a bounded number of times', async () => {
    let calls = 0;
    const generator = new GeminiGenerateContentAnswerGenerator({
      apiKey: 'test-secret', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.8-flash',
      retryAttempts: 3, retryDelayMs: 0,
      fetchImpl: async () => { calls++; throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); },
    });
    await assert.rejects(generator.generate('question', [source]), (err: unknown) => {
      assert.ok(err instanceof AnswerProviderError);
      assert.equal(err.providerCategory, 'timeout');
      assert.equal(err.attempts, 3);
      return true;
    });
    assert.equal(calls, 3);
  });

  it('does not retry authentication or model-not-found errors', async () => {
    for (const [status, category] of [[401, 'authentication'], [404, 'model_unavailable']] as const) {
      let calls = 0;
      const generator = new GeminiGenerateContentAnswerGenerator({
        apiKey: 'test-secret', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'not-a-model',
        retryAttempts: 4, retryDelayMs: 0,
        fetchImpl: async () => { calls++; return response(status, { error: { message: 'do not expose provider body' } }); },
      });
      await assert.rejects(generator.generate('question', [source]), (err: unknown) => {
        assert.ok(err instanceof AnswerProviderError);
        assert.equal(err.providerStatus, status);
        assert.equal(err.providerCategory, category);
        assert.equal(err.attempts, 1);
        assert.equal(err.message.includes('do not expose'), false);
        return true;
      });
      assert.equal(calls, 1);
    }
  });

  it('retries rate limiting and provider-unavailable responses, then succeeds', async () => {
    for (const status of [429, 503]) {
      let calls = 0;
      const generator = new GeminiGenerateContentAnswerGenerator({
        apiKey: 'test-secret', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.8-flash',
        retryAttempts: 3, retryDelayMs: 0,
        fetchImpl: async () => ++calls === 1
          ? response(status, { error: { status: status === 503 ? 'UNAVAILABLE' : 'RESOURCE_EXHAUSTED' } })
          : response(200, { candidates: [{ content: { parts: [{ text: 'Supported [1].' }] } }] }),
      });
      assert.equal(await generator.generate('question', [source]), 'Supported [1].');
      assert.equal(calls, 2);
    }
  });

  it('rejects a malformed successful response without retrying', async () => {
    let calls = 0;
    const generator = new GeminiGenerateContentAnswerGenerator({
      apiKey: 'test-secret', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.8-flash',
      retryAttempts: 3, retryDelayMs: 0,
      fetchImpl: async () => { calls++; return response(200, { candidates: [{ content: { parts: [] } }] }); },
    });
    await assert.rejects(generator.generate('question', [source]), (err: unknown) => {
      assert.ok(err instanceof AnswerProviderError);
      assert.equal(err.providerCategory, 'malformed_response');
      return true;
    });
    assert.equal(calls, 1);
  });

  it('keeps the generic OpenAI-compatible adapter available', async () => {
    let url = '';
    const generator = new OpenAICompatibleAnswerGenerator({
      apiKey: 'test-secret', baseUrl: 'https://provider.example/v1', model: 'model-x', retryAttempts: 1,
      fetchImpl: async (input) => {
        url = String(input);
        return response(200, { choices: [{ message: { content: 'Compatible answer [1].' } }] });
      },
    });
    assert.equal(await generator.generate('question', [source]), 'Compatible answer [1].');
    assert.equal(url, 'https://provider.example/v1/chat/completions');
  });
});
