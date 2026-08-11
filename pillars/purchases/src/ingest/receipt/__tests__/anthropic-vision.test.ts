/**
 * The Anthropic SDK is the only mock — it is the network boundary and tests
 * MUST NOT reach a real API. `@pops/ai-telemetry`'s `callWithLogging` runs for
 * real with an injected fake `report`/`lookupPricing` (`__setPurchasesTelemetryDepsForTests`,
 * mirroring finance/food/cerebrum), so these also assert usage is reported
 * with the right operation/domain/provider and that a failure still reports
 * before rethrowing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

import {
  ANTHROPIC_PROVIDER,
  PURCHASES_DOMAIN,
  __setPurchasesTelemetryDepsForTests,
} from '../../../api/ai-telemetry-deps.js';
import { createAnthropicVision, DEFAULT_RECEIPT_MODEL, receiptModel } from '../anthropic-vision.js';

import type { InferenceRecord, PricingEntry } from '@pops/ai-telemetry';

import type { ReceiptPart } from '../vision.js';

const KEY_VAR = 'ANTHROPIC_API_KEY';
const MODEL_VAR = 'PURCHASES_RECEIPT_MODEL';

const PRICING: PricingEntry = { input: 1, output: 5 };

function anthropicMessage(text: string, inputTokens = 100, outputTokens = 20) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

interface Captured {
  records: InferenceRecord[];
  /** Resolves once the fire-and-forget telemetry report lands. */
  nextReport: () => Promise<InferenceRecord>;
}

function captureReports(pricing: PricingEntry | null = PRICING): Captured {
  const records: InferenceRecord[] = [];
  let resolveNext: ((record: InferenceRecord) => void) | undefined;
  __setPurchasesTelemetryDepsForTests({
    lookupPricing: () => Promise.resolve(pricing),
    report: (record) => {
      records.push(record);
      resolveNext?.(record);
      return Promise.resolve();
    },
  });
  return {
    records,
    nextReport: () =>
      new Promise<InferenceRecord>((resolve) => {
        if (records.length > 0) {
          resolve(records[records.length - 1]!);
          return;
        }
        resolveNext = resolve;
      }),
  };
}

beforeEach(() => {
  createMock.mockReset();
  process.env[KEY_VAR] = 'sk-test';
});

afterEach(() => {
  __setPurchasesTelemetryDepsForTests(null);
  delete process.env[KEY_VAR];
  delete process.env[MODEL_VAR];
});

describe('createAnthropicVision', () => {
  it('returns null when no API key is configured', () => {
    delete process.env[KEY_VAR];
    expect(createAnthropicVision()).toBeNull();
  });

  it('returns a vision port when a key is configured', () => {
    expect(createAnthropicVision()).not.toBeNull();
  });
});

describe('receiptModel', () => {
  it('defaults to DEFAULT_RECEIPT_MODEL', () => {
    expect(receiptModel()).toBe(DEFAULT_RECEIPT_MODEL);
  });

  it('honours the PURCHASES_RECEIPT_MODEL override', () => {
    process.env[MODEL_VAR] = 'claude-receipt-override';
    expect(receiptModel()).toBe('claude-receipt-override');
  });

  it('falls back to the default when the override is the empty string', () => {
    process.env[MODEL_VAR] = '';
    expect(receiptModel()).toBe(DEFAULT_RECEIPT_MODEL);
  });
});

describe('read', () => {
  it('sends an image part as an image content block and reports success telemetry', async () => {
    const captured = captureReports();
    createMock.mockResolvedValue(anthropicMessage('receipt text', 321, 88));
    const vision = createAnthropicVision();

    const parts: ReceiptPart[] = [{ mediaType: 'image/png', dataBase64: 'ZmFrZQ==' }];
    const result = await vision?.read(parts);

    expect(result).toBe('receipt text');
    const [request] = createMock.mock.calls[0] as [{ messages: { content: unknown[] }[] }];
    const [block] = request.messages[0]!.content;
    expect(block).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'ZmFrZQ==' },
    });

    const record = await captured.nextReport();
    expect(record.operation).toBe('receipt-extraction');
    expect(record.domain).toBe(PURCHASES_DOMAIN);
    expect(record.provider).toBe(ANTHROPIC_PROVIDER);
    expect(record.status).toBe('success');
    expect(record.inputTokens).toBe(321);
    expect(record.outputTokens).toBe(88);
  });

  it('sends a pdf part as a base64 document content block', async () => {
    captureReports();
    createMock.mockResolvedValue(anthropicMessage('invoice text'));
    const vision = createAnthropicVision();

    const parts: ReceiptPart[] = [{ mediaType: 'application/pdf', dataBase64: 'ZmFrZQ==' }];
    await vision?.read(parts);

    const [request] = createMock.mock.calls[0] as [{ messages: { content: unknown[] }[] }];
    const [block] = request.messages[0]!.content;
    expect(block).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: 'ZmFrZQ==' },
    });
  });

  it('sends a text/plain part as a decoded text document content block', async () => {
    captureReports();
    createMock.mockResolvedValue(anthropicMessage('order confirmation text'));
    const vision = createAnthropicVision();

    const dataBase64 = Buffer.from('hello from the order email', 'utf8').toString('base64');
    const parts: ReceiptPart[] = [{ mediaType: 'text/plain', dataBase64 }];
    await vision?.read(parts);

    const [request] = createMock.mock.calls[0] as [{ messages: { content: unknown[] }[] }];
    const [block] = request.messages[0]!.content;
    expect(block).toEqual({
      type: 'document',
      source: { type: 'text', media_type: 'text/plain', data: 'hello from the order email' },
    });
  });

  it('appends the extraction prompt as the final content block', async () => {
    captureReports();
    createMock.mockResolvedValue(anthropicMessage('x'));
    const vision = createAnthropicVision();

    await vision?.read([{ mediaType: 'image/png', dataBase64: 'ZmFrZQ==' }]);

    const [request] = createMock.mock.calls[0] as [{ messages: { content: unknown[] }[] }];
    const blocks = request.messages[0]!.content;
    const last = blocks[blocks.length - 1] as { type: string; text: string };
    expect(last.type).toBe('text');
    expect(last.text).toContain('reading ONE purchase receipt');
  });

  it('returns null when the model responds with no text content', async () => {
    captureReports();
    createMock.mockResolvedValue({
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });
    const vision = createAnthropicVision();

    const result = await vision?.read([{ mediaType: 'image/png', dataBase64: 'ZmFrZQ==' }]);
    expect(result).toBeNull();
  });

  it('reports a status:error record and rethrows when the API call throws', async () => {
    const captured = captureReports();
    createMock.mockRejectedValue(new Error('anthropic boom'));
    const vision = createAnthropicVision();

    await expect(
      vision?.read([{ mediaType: 'image/png', dataBase64: 'ZmFrZQ==' }])
    ).rejects.toThrow('anthropic boom');

    const record = await captured.nextReport();
    expect(record.status).toBe('error');
    expect(record.operation).toBe('receipt-extraction');
    expect(record.domain).toBe(PURCHASES_DOMAIN);
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBe(0);
    expect(record.errorMessage).toBeDefined();
  });

  it('uses the PURCHASES_RECEIPT_MODEL override for the request and the reported model', async () => {
    const captured = captureReports();
    process.env[MODEL_VAR] = 'claude-receipt-override';
    createMock.mockResolvedValue(anthropicMessage('x'));
    const vision = createAnthropicVision();

    await vision?.read([{ mediaType: 'image/png', dataBase64: 'ZmFrZQ==' }]);

    const [request] = createMock.mock.calls[0] as [{ model: string }];
    expect(request.model).toBe('claude-receipt-override');

    const record = await captured.nextReport();
    expect(record.model).toBe('claude-receipt-override');
  });
});
