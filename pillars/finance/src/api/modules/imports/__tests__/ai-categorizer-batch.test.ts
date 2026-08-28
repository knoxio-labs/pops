/**
 * Unit tests for the batched categorizer (CP025/#3656). The Anthropic SDK is
 * mocked so the batch request shape, N-way response parsing (incl. partial
 * malformation), cost accounting, and env gating are exercised without a
 * network call — mirrors ai-categorizer.test.ts for the single-row path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiCategorizationError } from '../ai-categorizer-error.js';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

const { categorizeBatchWithAi } = await import('../ai-categorizer.js');

const FLAG = 'FINANCE_AI_CATEGORIZER_ENABLED';
const KEY = 'ANTHROPIC_API_KEY';

/** Closed vocabulary in the shape `loadKnownTags` returns (POPS-2606). */
const VOCAB = ['contains:groceries', 'venue:supermarket', 'occasion:home'];

function textResponse(text: string, inputTokens = 200, outputTokens = 60) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function promptSentToApi(): string {
  const req = createMock.mock.calls[0]?.[0] as { messages: { role: string; content: string }[] };
  const content = req.messages[0]?.content;
  if (typeof content !== 'string') throw new Error('expected a string prompt');
  return content;
}

beforeEach(() => {
  createMock.mockReset();
});

afterEach(() => {
  delete process.env[FLAG];
  delete process.env[KEY];
  delete process.env['FINANCE_AI_CATEGORIZER_BATCH_SIZE'];
  delete process.env['FINANCE_AI_CATEGORIZER_BATCH_MAX_TOKENS'];
});

describe('categorizeBatchWithAi — gating', () => {
  it('resolves an empty array of results for an empty input with no call', async () => {
    const out = await categorizeBatchWithAi([], undefined, VOCAB);
    expect(out.results).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('is disabled by default and returns one null per input without calling the SDK', async () => {
    const out = await categorizeBatchWithAi(
      [{ description: 'A' }, { description: 'B' }],
      undefined,
      VOCAB
    );
    expect(out.results).toEqual([null, null]);
    expect(out.usage).toBeUndefined();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws NO_API_KEY when enabled without a key', async () => {
    process.env[FLAG] = 'true';
    await expect(
      categorizeBatchWithAi([{ description: 'A' }], undefined, VOCAB)
    ).rejects.toMatchObject({
      name: 'AiCategorizationError',
      code: 'NO_API_KEY',
    });
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('categorizeBatchWithAi — live call (mocked SDK)', () => {
  beforeEach(() => {
    process.env[FLAG] = 'true';
    process.env[KEY] = 'sk-test';
  });

  it('sends one call for the whole batch and maps replies back by position', async () => {
    createMock.mockResolvedValue(
      textResponse(
        '[{"entityName":"Woolworths","contains":["groceries"]},{"entityName":"Aldi","contains":["groceries"]}]'
      )
    );

    const out = await categorizeBatchWithAi(
      [{ description: 'WOOLWORTHS 1234' }, { description: 'ALDI 4823' }],
      undefined,
      VOCAB
    );

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(out.results).toHaveLength(2);
    expect(out.results[0]?.entityName).toBe('Woolworths');
    expect(out.results[1]?.entityName).toBe('Aldi');
    expect(out.usage).toBeDefined();
  });

  it('numbers each transaction in the prompt and asks for a same-length JSON array reply', async () => {
    createMock.mockResolvedValue(textResponse('[{"entityName":"A"},{"entityName":"B"}]'));
    await categorizeBatchWithAi(
      [{ description: 'FIRST ROW' }, { description: 'SECOND ROW' }],
      undefined,
      VOCAB
    );

    const prompt = promptSentToApi();
    expect(prompt).toContain('1. Description: FIRST ROW');
    expect(prompt).toContain('2. Description: SECOND ROW');
    expect(prompt).toContain('JSON array of exactly 2 objects');
  });

  it('degrades a single malformed entry to null without failing the rest of the batch', async () => {
    createMock.mockResolvedValue(
      textResponse('[{"entityName":"Woolworths"}, "not an object", {"entityName":"Aldi"}]')
    );

    const out = await categorizeBatchWithAi(
      [{ description: 'WOOLWORTHS' }, { description: 'GARBLED' }, { description: 'ALDI' }],
      undefined,
      VOCAB
    );

    expect(out.results[0]?.entityName).toBe('Woolworths');
    expect(out.results[1]).toBeNull();
    expect(out.results[2]?.entityName).toBe('Aldi');
  });

  it('pads a short reply with null for the rows the model dropped', async () => {
    createMock.mockResolvedValue(textResponse('[{"entityName":"Woolworths"}]'));

    const out = await categorizeBatchWithAi(
      [{ description: 'WOOLWORTHS' }, { description: 'UNSEEN ROW' }],
      undefined,
      VOCAB
    );

    expect(out.results).toHaveLength(2);
    expect(out.results[0]?.entityName).toBe('Woolworths');
    expect(out.results[1]).toBeNull();
  });

  it('rejects with AiCategorizationError(PARSE_ERROR) when the whole reply has no JSON array', async () => {
    createMock.mockResolvedValue(textResponse('Sorry, I could not process these.'));
    const err = await categorizeBatchWithAi([{ description: 'X' }], undefined, VOCAB).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(AiCategorizationError);
    expect((err as AiCategorizationError).code).toBe('PARSE_ERROR');
  });

  it('maps a 429 to RATE_LIMITED after retries are exhausted', async () => {
    vi.useFakeTimers();
    try {
      const err = Object.assign(new Error('Too Many Requests'), { status: 429 });
      createMock.mockRejectedValue(err);
      const promise = categorizeBatchWithAi([{ description: 'X' }], undefined, VOCAB).catch(
        (e: unknown) => e
      );
      await vi.runAllTimersAsync();
      const caught = await promise;
      expect(caught).toBeInstanceOf(AiCategorizationError);
      expect((caught as AiCategorizationError).code).toBe('RATE_LIMITED');
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours the FINANCE_AI_CATEGORIZER_BATCH_MAX_TOKENS override', async () => {
    process.env['FINANCE_AI_CATEGORIZER_BATCH_MAX_TOKENS'] = '999';
    createMock.mockResolvedValue(textResponse('[{"entityName":"A"}]'));
    await categorizeBatchWithAi([{ description: 'X' }], undefined, VOCAB);
    const req = createMock.mock.calls[0]?.[0] as { max_tokens: number };
    expect(req.max_tokens).toBe(999);
  });
});

describe('categorizeBatchWithAi — PII allowlist (CF008)', () => {
  beforeEach(() => {
    process.env[FLAG] = 'true';
    process.env[KEY] = 'sk-test';
  });

  it('never renders raw-row/account fields into the batch prompt', async () => {
    createMock.mockResolvedValue(textResponse('[{"entityName":"Aldi"}]'));
    await categorizeBatchWithAi(
      [{ description: 'ALDI STORES', amount: 18.9, date: '2026-03-14' }],
      undefined,
      VOCAB
    );

    const prompt = promptSentToApi();
    expect(prompt).toContain('ALDI STORES');
    expect(prompt).not.toContain('rawRow');
    expect(prompt).not.toContain('account');
  });
});
