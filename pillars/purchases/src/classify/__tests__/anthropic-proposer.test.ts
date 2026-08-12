/**
 * The Anthropic SDK is the only mock — it is the network boundary and tests
 * MUST NOT reach a real API. `@pops/ai-telemetry`'s `callWithLogging` runs
 * for real against an injected fake sink, so these also assert that a
 * classification sweep is attributable in the same place as every other
 * Claude call on the fleet, and that a failed batch still reports before it
 * rethrows.
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
} from '../../api/ai-telemetry-deps.js';
import {
  createAnthropicItemKindProposer,
  DEFAULT_ITEM_KIND_MODEL,
  itemKindModel,
} from '../anthropic-proposer.js';

import type { InferenceRecord, PricingEntry } from '@pops/ai-telemetry';

import type { ProposalCandidate } from '../batch.js';

const KEY_VAR = 'ANTHROPIC_API_KEY';
const MODEL_VAR = 'PURCHASES_ITEM_KIND_MODEL';

const BATCH: readonly ProposalCandidate[] = [
  { key: 'k1', source: 'amazon', name: 'Robot vacuum', sku: 'B0ROBOT', itemIds: ['i1'] },
];

function anthropicMessage(text: string, inputTokens = 100, outputTokens = 20) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

interface Captured {
  records: InferenceRecord[];
  nextReport: () => Promise<InferenceRecord>;
}

function captureReports(pricing: PricingEntry | null = { input: 1, output: 5 }): Captured {
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
        const last = records.at(-1);
        if (last !== undefined) {
          resolve(last);
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

describe('createAnthropicItemKindProposer', () => {
  it('returns null when no API key is configured', () => {
    // Ingest deliberately works without one. A caller with no key must be
    // told before it starts a sweep, not per batch out of sight.
    delete process.env[KEY_VAR];
    expect(createAnthropicItemKindProposer()).toBeNull();
  });

  it('returns a proposer when a key is configured', () => {
    expect(createAnthropicItemKindProposer()).not.toBeNull();
  });
});

describe('itemKindModel', () => {
  it('defaults to a model id the provider actually serves', () => {
    // Spelled out rather than compared to the constant: `itemKindModel() ===
    // DEFAULT_ITEM_KIND_MODEL` holds for any string, including one no
    // provider serves, and nothing else in this pillar ever calls the API.
    expect(DEFAULT_ITEM_KIND_MODEL).toBe('claude-haiku-4-5');
    expect(itemKindModel()).toBe(DEFAULT_ITEM_KIND_MODEL);
  });

  it('honours the override', () => {
    process.env[MODEL_VAR] = 'claude-kind-override';
    expect(itemKindModel()).toBe('claude-kind-override');
  });

  it('falls back to the default when the override is the empty string', () => {
    process.env[MODEL_VAR] = '';
    expect(itemKindModel()).toBe(DEFAULT_ITEM_KIND_MODEL);
  });
});

describe('propose', () => {
  it('sends the batch as a prompt and returns the raw text', async () => {
    captureReports();
    createMock.mockResolvedValue(anthropicMessage('{"proposals":[]}'));

    const result = await createAnthropicItemKindProposer()?.propose(BATCH);
    expect(result).toBe('{"proposals":[]}');

    const [request] = createMock.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(request.messages[0]?.content).toContain('1. (amazon) Robot vacuum [B0ROBOT]');
  });

  it("reports usage under its own operation, not the receipt reader's", async () => {
    // Two Claude callers in one pillar. Sharing an operation name would
    // make a runaway sweep indistinguishable from receipt uploads.
    const captured = captureReports();
    createMock.mockResolvedValue(anthropicMessage('{"proposals":[]}', 321, 88));

    await createAnthropicItemKindProposer()?.propose(BATCH);

    const record = await captured.nextReport();
    expect(record).toMatchObject({
      operation: 'item-kind-proposal',
      domain: PURCHASES_DOMAIN,
      provider: ANTHROPIC_PROVIDER,
      status: 'success',
      inputTokens: 321,
      outputTokens: 88,
    });
  });

  it('returns null when the model responds with no text', async () => {
    captureReports();
    createMock.mockResolvedValue({ content: [], usage: { input_tokens: 10, output_tokens: 0 } });
    expect(await createAnthropicItemKindProposer()?.propose(BATCH)).toBeNull();
  });

  it('reports an error record and rethrows when the API call throws', async () => {
    const captured = captureReports();
    createMock.mockRejectedValue(new Error('anthropic boom'));

    await expect(createAnthropicItemKindProposer()?.propose(BATCH)).rejects.toThrow(
      'anthropic boom'
    );

    const record = await captured.nextReport();
    expect(record).toMatchObject({ status: 'error', operation: 'item-kind-proposal' });
  });

  it('uses the override for the request and the reported model', async () => {
    const captured = captureReports();
    process.env[MODEL_VAR] = 'claude-kind-override';
    createMock.mockResolvedValue(anthropicMessage('{"proposals":[]}'));

    await createAnthropicItemKindProposer()?.propose(BATCH);

    const [request] = createMock.mock.calls[0] as [{ model: string }];
    expect(request.model).toBe('claude-kind-override');
    expect((await captured.nextReport()).model).toBe('claude-kind-override');
  });
});
