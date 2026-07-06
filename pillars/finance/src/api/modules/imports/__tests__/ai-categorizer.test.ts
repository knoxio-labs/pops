/**
 * Unit tests for the F2 AI categorizer. The Anthropic SDK is mocked so the
 * request shape, response parsing (incl. ```json fences + placeholder
 * sanitisation), cost accounting, env gating, and error-code mapping are
 * exercised without a network call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiCategorizationError } from '../ai-categorizer-error.js';

import type { ParsedTransaction } from '../types.js';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

const { categorizeWithAi, isAiCategorizerEnabled, toCategorizerInput } =
  await import('../ai-categorizer.js');

const FLAG = 'FINANCE_AI_CATEGORIZER_ENABLED';
const KEY = 'ANTHROPIC_API_KEY';

function textResponse(text: string, inputTokens = 100, outputTokens = 20) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

beforeEach(() => {
  createMock.mockReset();
});

afterEach(() => {
  delete process.env[FLAG];
  delete process.env[KEY];
  delete process.env['FINANCE_AI_CATEGORIZER_MODEL'];
  delete process.env['FINANCE_AI_CATEGORIZER_MAX_TOKENS'];
});

describe('categorizeWithAi — gating', () => {
  it('is disabled by default and never calls the SDK', async () => {
    expect(isAiCategorizerEnabled()).toBe(false);
    const out = await categorizeWithAi({ description: 'SOME MERCHANT' }, undefined, ['groceries']);
    expect(out.result).toBeNull();
    expect(out.usage).toBeUndefined();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws NO_API_KEY when enabled without a key', async () => {
    process.env[FLAG] = 'true';
    await expect(categorizeWithAi({ description: 'RAW' })).rejects.toMatchObject({
      name: 'AiCategorizationError',
      code: 'NO_API_KEY',
    });
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('categorizeWithAi — live call (mocked SDK)', () => {
  beforeEach(() => {
    process.env[FLAG] = 'true';
    process.env[KEY] = 'sk-test';
  });

  it('sends the default model + max_tokens and parses entity + tags + usage', async () => {
    createMock.mockResolvedValue(textResponse('{"entityName":"Woolworths","tags":["groceries"]}'));
    const out = await categorizeWithAi({ description: 'WOOLWORTHS 1234' }, undefined, [
      'groceries',
    ]);

    expect(createMock).toHaveBeenCalledTimes(1);
    const req = createMock.mock.calls[0]?.[0] as { model: string; max_tokens: number };
    expect(req.model).toBe('claude-haiku-4-5-20251001');
    expect(req.max_tokens).toBe(200);

    expect(out.result?.entityName).toBe('Woolworths');
    expect(out.result?.tags).toEqual(['groceries']);
    // cost = 100/1e6 * 1 + 20/1e6 * 5 = 0.0002
    expect(out.usage?.costUsd).toBeCloseTo(0.0002, 9);
  });

  it('honours the model + maxTokens env overrides', async () => {
    process.env['FINANCE_AI_CATEGORIZER_MODEL'] = 'claude-sonnet-4-6';
    process.env['FINANCE_AI_CATEGORIZER_MAX_TOKENS'] = '512';
    createMock.mockResolvedValue(textResponse('{"entityName":"X","tags":[]}'));
    await categorizeWithAi({ description: 'X' });
    const req = createMock.mock.calls[0]?.[0] as { model: string; max_tokens: number };
    expect(req.model).toBe('claude-sonnet-4-6');
    expect(req.max_tokens).toBe(512);
  });

  it('strips ```json fences before parsing', async () => {
    createMock.mockResolvedValue(
      textResponse('```json\n{"entityName":"Aldi","tags":["groceries"]}\n```')
    );
    const out = await categorizeWithAi({ description: 'ALDI' });
    expect(out.result?.entityName).toBe('Aldi');
  });

  it('parses a response that appends prose after the JSON object', async () => {
    createMock.mockResolvedValue(
      textResponse(
        '{\n  "entityName": "Ozturk Jr",\n  "tags": ["Dining"]\n}\nThis looks like a Darlington restaurant.'
      )
    );
    const out = await categorizeWithAi({ description: 'OZTURK JR 176752 DARLINGTON' });
    expect(out.result?.entityName).toBe('Ozturk Jr');
    expect(out.result?.tags).toEqual(['Dining']);
  });

  // Classifying a bad parse as AiCategorizationError (rather than letting a raw
  // SyntaxError escape) is what keeps the row out of the Failed bucket: the
  // caller `tryAiCategorization` catches any AiCategorizationError and degrades
  // to uncertain. This asserts the classification; the degrade lives in
  // process-transaction.ts.
  it('rejects with AiCategorizationError(PARSE_ERROR) on an unparseable reply', async () => {
    createMock.mockResolvedValue(textResponse('Sorry, I cannot determine the merchant.'));
    const err = await categorizeWithAi({ description: 'MYSTERY' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiCategorizationError);
    expect((err as AiCategorizationError).code).toBe('PARSE_ERROR');
  });

  it('sanitises a placeholder entity name to null (usage still recorded)', async () => {
    createMock.mockResolvedValue(textResponse('{"entityName":"Unknown Vendor","tags":["misc"]}'));
    const out = await categorizeWithAi({ description: 'MYSTERY CHARGE' });
    expect(out.result?.entityName).toBeNull();
    expect(out.usage).toBeDefined();
  });

  it('maps a 400 credit-balance error to INSUFFICIENT_CREDITS', async () => {
    createMock.mockRejectedValue({
      status: 400,
      message: 'bad request',
      error: { error: { message: 'Your credit balance is too low' } },
    });
    await expect(categorizeWithAi({ description: 'X' })).rejects.toMatchObject({
      name: 'AiCategorizationError',
      code: 'INSUFFICIENT_CREDITS',
    });
  });

  it('maps other failures to API_ERROR', async () => {
    createMock.mockRejectedValue(new Error('network down'));
    const err = await categorizeWithAi({ description: 'X' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiCategorizationError);
    expect((err as AiCategorizationError).code).toBe('API_ERROR');
  });
});

// CF008 — the categorizer must never leak raw bank-row PII to the Anthropic
// API. Regression for #3614: `buildPrompt` interpolated the whole parsed CSV
// row (`JSON.stringify(row)`), sending every column — including account and
// reference numbers — to Claude. Only the allowlisted description/amount/date
// may reach the prompt now.
describe('categorizeWithAi — PII allowlist (CF008)', () => {
  const ACCOUNT_NUMBER = '4111222233334444';
  const REFERENCE = 'REF-SECRET-98765';

  beforeEach(() => {
    process.env[FLAG] = 'true';
    process.env[KEY] = 'sk-test';
  });

  function promptSentToApi(): string {
    const req = createMock.mock.calls[0]?.[0] as {
      messages: { role: string; content: string }[];
    };
    const content = req.messages[0]?.content;
    if (typeof content !== 'string') throw new Error('expected a string prompt');
    return content;
  }

  it('sends the allowlisted description/amount/date and nothing else from the row', async () => {
    createMock.mockResolvedValue(textResponse('{"entityName":"Woolworths","tags":["Groceries"]}'));

    const transaction: ParsedTransaction = {
      date: '2026-01-02',
      description: 'WOOLWORTHS METRO 1234',
      amount: 42.5,
      account: 'Amex',
      location: 'SYDNEY',
      rawRow: JSON.stringify({
        Date: '02/01/2026',
        Description: 'WOOLWORTHS METRO 1234',
        Amount: '42.50',
        'Account Number': ACCOUNT_NUMBER,
        Reference: REFERENCE,
      }),
      checksum: 'deadbeef',
    };

    await categorizeWithAi(toCategorizerInput(transaction), 'batch-x', ['Groceries']);

    const prompt = promptSentToApi();
    expect(prompt).toContain('WOOLWORTHS METRO 1234');
    expect(prompt).toContain('42.5');
    expect(prompt).toContain('2026-01-02');

    expect(prompt).not.toContain(ACCOUNT_NUMBER);
    expect(prompt).not.toContain(REFERENCE);
    expect(prompt).not.toContain('Account Number');
    expect(prompt).not.toContain(transaction.rawRow);
  });

  it('never carries the raw row even when its extra columns embed secrets', async () => {
    createMock.mockResolvedValue(textResponse('{"entityName":"Aldi","tags":["Groceries"]}'));

    const transaction: ParsedTransaction = {
      date: '2026-03-14',
      description: 'ALDI STORES',
      amount: 18.9,
      account: 'Amex',
      rawRow: JSON.stringify({
        Description: 'ALDI STORES',
        Amount: '18.90',
        Card: `card-${ACCOUNT_NUMBER}`,
        Memo: `internal ${REFERENCE}`,
      }),
      checksum: 'cafef00d',
    };

    await categorizeWithAi(toCategorizerInput(transaction), undefined, ['Groceries']);

    const prompt = promptSentToApi();
    expect(prompt).toContain('ALDI STORES');
    expect(prompt).not.toContain(ACCOUNT_NUMBER);
    expect(prompt).not.toContain(REFERENCE);
    expect(prompt).not.toContain('card-');
    expect(prompt).not.toContain('Memo');
  });
});
