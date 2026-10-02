/**
 * Unit tests for the corrections AI runtime's default Claude completer
 * (CF019/#3625). Before this fix, `defaultCompleter` wrapped the Anthropic
 * call in a bare try/catch that collapsed every failure — a transient 429, a
 * genuine API error, anything — to `null`, indistinguishable from "the AI had
 * nothing to say". It now retries 429s via `withRateLimitRetry` and throws a
 * typed `ClaudeCompletionError` (`RATE_LIMITED` | `API_ERROR`) when the call
 * still fails, so a rate limit during rule generation surfaces as a real
 * error instead of a silent empty result with a 200.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

const { getClaudeCompleter, ClaudeCompletionError } = await import('../ai-runtime.js');

const KEY = 'ANTHROPIC_API_KEY';

function textResponse(text: string, inputTokens = 10, outputTokens = 5) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function rateLimitError(): Error {
  const err = new Error('Too Many Requests') as Error & { status: number };
  err.status = 429;
  return err;
}

beforeEach(() => {
  createMock.mockReset();
  process.env[KEY] = 'sk-test';
});

afterEach(() => {
  delete process.env[KEY];
  delete process.env['FINANCE_CORRECTIONS_AI_MODEL'];
  vi.useRealTimers();
});

describe('defaultCompleter — no API key', () => {
  it('returns null without ever calling the SDK', async () => {
    delete process.env[KEY];
    const out = await getClaudeCompleter()({
      prompt: 'p',
      maxTokens: 100,
      operation: 'analyze-correction',
    });
    expect(out).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('defaultCompleter — success', () => {
  it('returns the model text', async () => {
    createMock.mockResolvedValue(textResponse('{"matchType":"contains"}'));
    const out = await getClaudeCompleter()({
      prompt: 'p',
      maxTokens: 100,
      operation: 'analyze-correction',
    });
    expect(out).toBe('{"matchType":"contains"}');
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe('defaultCompleter — rate limiting (CF019)', () => {
  it('retries transient 429s and succeeds without surfacing an error', async () => {
    vi.useFakeTimers();
    createMock
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValue(textResponse('{"matchType":"exact"}'));

    const promise = getClaudeCompleter()({
      prompt: 'p',
      maxTokens: 100,
      operation: 'generate-rules',
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('{"matchType":"exact"}');
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('throws a typed ClaudeCompletionError(RATE_LIMITED) once retries are exhausted, instead of returning null', async () => {
    vi.useFakeTimers();
    createMock.mockRejectedValue(rateLimitError());

    const promise = getClaudeCompleter()({
      prompt: 'p',
      maxTokens: 100,
      operation: 'generate-rules',
    });
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'ClaudeCompletionError',
      code: 'RATE_LIMITED',
    });
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('rejects with an instance of ClaudeCompletionError', async () => {
    vi.useFakeTimers();
    createMock.mockRejectedValue(rateLimitError());

    const promise = getClaudeCompleter()({
      prompt: 'p',
      maxTokens: 100,
      operation: 'generate-rules',
    });
    const assertion = promise.catch((err: unknown) => err);
    await vi.runAllTimersAsync();
    const err = await assertion;
    expect(err).toBeInstanceOf(ClaudeCompletionError);
  });
});

describe('defaultCompleter — non-rate-limit API failure', () => {
  it('throws a typed ClaudeCompletionError(API_ERROR) instead of returning null', async () => {
    createMock.mockRejectedValue(new Error('service unavailable'));

    await expect(
      getClaudeCompleter()({ prompt: 'p', maxTokens: 100, operation: 'revise-changeset' })
    ).rejects.toMatchObject({ name: 'ClaudeCompletionError', code: 'API_ERROR' });
  });
});

describe('defaultCompleter — model-specific request shape', () => {
  const request = { prompt: 'p', maxTokens: 200, operation: 'analyze-correction' };

  it('sends Haiku the exact cap it was given, no temperature and no output_config', async () => {
    createMock.mockResolvedValue(textResponse('ok'));
    await getClaudeCompleter()({ ...request, model: 'claude-haiku-4-5-20251001' });
    expect(createMock.mock.calls[0]?.[0]).toEqual({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: 'p' }],
    });
  });

  it('sends Sonnet 5.5 low effort and a max_tokens floor above a 200 cap', async () => {
    createMock.mockResolvedValue(textResponse('ok'));
    await getClaudeCompleter()({ ...request, model: 'claude-sonnet-5-5' });
    const sent = createMock.mock.calls[0]?.[0];
    expect(sent.output_config).toEqual({ effort: 'low' });
    expect(sent.max_tokens).toBe(2000);
    expect(sent).not.toHaveProperty('temperature');
  });

  it('keeps a cap already above the floor', async () => {
    createMock.mockResolvedValue(textResponse('ok'));
    await getClaudeCompleter()({ ...request, maxTokens: 4000, model: 'claude-opus-5-5' });
    expect(createMock.mock.calls[0]?.[0].max_tokens).toBe(4000);
  });

  it('returns the text block that follows a leading thinking block', async () => {
    createMock.mockResolvedValue({
      content: [
        { type: 'thinking', thinking: 'hmm', signature: 's' },
        { type: 'text', text: '{"matchType":"exact"}' },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const out = await getClaudeCompleter()({ ...request, model: 'claude-sonnet-5-5' });
    expect(out).toBe('{"matchType":"exact"}');
  });

  it('returns null when the reply holds no text block', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'thinking', thinking: 'hmm', signature: 's' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(await getClaudeCompleter()({ ...request, model: 'claude-sonnet-5-5' })).toBeNull();
  });
});

describe('defaultCompleter — client timeout', () => {
  it('constructs the client with retries off and a 60s timeout', async () => {
    const ctor = vi.fn();
    vi.resetModules();
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = { create: createMock };
        constructor(opts: unknown) {
          ctor(opts);
        }
      },
    }));
    createMock.mockResolvedValue(textResponse('ok'));
    const fresh = await import('../ai-runtime.js');
    await fresh.getClaudeCompleter()({ prompt: 'p', maxTokens: 100, operation: 'x' });
    expect(ctor).toHaveBeenCalledWith({ apiKey: 'sk-test', maxRetries: 0, timeout: 60_000 });
    vi.doUnmock('@anthropic-ai/sdk');
  });
});
