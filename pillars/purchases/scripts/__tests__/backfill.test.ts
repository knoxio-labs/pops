/**
 * The ingest CLI's credential, asserted at the wire.
 *
 * Purchases admits an uncredentialled caller, so a backfill that stopped
 * sending its key would keep working — every request would still be a 201, no
 * test that only checks outcomes would notice, and the inbound scope gate
 * would quietly stop applying to this caller. So these tests read the headers
 * of the requests the real functions actually issue, one assertion per call
 * rather than a spot check on the first one, and cover the failure the whole
 * change exists to prevent: an absent key must stop the run, not anonymise it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createIngestClient,
  DEFAULT_BASE_URL,
  INGEST_API_KEY_ENV,
  postPurchases,
  upsertSource,
  type IngestClient,
  type SourceRegistration,
} from '../backfill.js';

import type { CreatePurchaseInput } from '../../src/db/services/purchase-input.js';

const CLIENT: IngestClient = { baseUrl: 'http://purchases.test', apiKey: 'pops_sa_test.secret' };

const SOURCE: SourceRegistration = {
  id: 'amazon',
  label: 'Amazon',
  descriptorPattern: 'AMAZON%',
  autoLinkPolicy: 'review',
  ingestAdapter: 'amazon-dsar-export',
};

function purchase(sourceOrderId: string): CreatePurchaseInput {
  return {
    source: 'amazon',
    sourceOrderId,
    ingestMethod: 'manual',
    orderedAt: '2026-08-01T00:00:00.000Z',
    currency: 'AUD',
    totalCents: 1234,
    checksum: sourceOrderId,
  };
}

/** Every request the code under test issued, in order. */
let calls: { url: string; init: RequestInit }[];

/**
 * A fetch that records rather than answers. Stubbing the global is deliberate:
 * the production path calls bare `fetch`, so a seam only tests use could be
 * satisfied while the real call went out bare.
 */
function stubFetch(status: number): void {
  calls = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response('{}', { status }));
  });
}

/** The `x-api-key` of a recorded call, however the headers were expressed. */
function apiKeyOf(init: RequestInit): string | null {
  return new Headers(init.headers).get('x-api-key');
}

/** The nth recorded request. Absent is a failure, not an empty assertion. */
function callAt(index: number): { url: string; init: RequestInit } {
  const call = calls[index];
  if (call === undefined) throw new Error(`no request was issued at index ${String(index)}`);
  return call;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createIngestClient', () => {
  it('refuses to build a client when no key is configured', () => {
    expect(() => createIngestClient({})).toThrow(new RegExp(INGEST_API_KEY_ENV));
  });

  it('treats a whitespace-only key as absent rather than sending it', () => {
    expect(() => createIngestClient({ [INGEST_API_KEY_ENV]: '   ' })).toThrow(
      new RegExp(INGEST_API_KEY_ENV)
    );
  });

  it('names the variable and the scopes the account needs', () => {
    let message = '';
    try {
      createIngestClient({});
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain(INGEST_API_KEY_ENV);
    expect(message).toContain('purchases.source');
    expect(message).toContain('purchases.purchase');
  });

  it('carries the key through, trimmed', () => {
    expect(createIngestClient({ [INGEST_API_KEY_ENV]: ' k \n' }).apiKey).toBe('k');
  });

  it('defaults the base URL and lets the environment override it', () => {
    expect(createIngestClient({ [INGEST_API_KEY_ENV]: 'k' }).baseUrl).toBe(DEFAULT_BASE_URL);
    expect(
      createIngestClient({ [INGEST_API_KEY_ENV]: 'k', PURCHASES_BASE_URL: 'http://elsewhere' })
        .baseUrl
    ).toBe('http://elsewhere');
  });
});

describe('upsertSource', () => {
  it('sends the key on the source registration', async () => {
    stubFetch(200);
    await upsertSource(CLIENT, SOURCE);

    expect(calls).toHaveLength(1);
    expect(callAt(0).url).toBe('http://purchases.test/sources/amazon');
    expect(callAt(0).init.method).toBe('PUT');
    expect(apiKeyOf(callAt(0).init)).toBe(CLIENT.apiKey);
  });

  it('still sends the JSON body it always did', async () => {
    stubFetch(200);
    await upsertSource(CLIENT, SOURCE);

    const { init } = callAt(0);
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({
      label: 'Amazon',
      descriptorPattern: 'AMAZON%',
      autoLinkPolicy: 'review',
      ingestAdapter: 'amazon-dsar-export',
    });
  });
});

describe('postPurchases', () => {
  it('sends the key on every order, not just the first', async () => {
    stubFetch(201);
    const outcome = await postPurchases(CLIENT, [
      purchase('order-1'),
      purchase('order-2'),
      purchase('order-3'),
    ]);

    expect(outcome.created).toBe(3);
    expect(calls).toHaveLength(3);
    expect(calls.map(({ init }) => apiKeyOf(init))).toEqual([
      CLIENT.apiKey,
      CLIENT.apiKey,
      CLIENT.apiKey,
    ]);
  });

  it('keeps sending the key after a rejected order', async () => {
    calls = [];
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response('nope', { status: calls.length === 1 ? 422 : 201 }));
    });

    const outcome = await postPurchases(CLIENT, [purchase('bad'), purchase('good')]);

    expect(outcome.created).toBe(1);
    expect(outcome.failures).toHaveLength(1);
    expect(calls.map(({ init }) => apiKeyOf(init))).toEqual([CLIENT.apiKey, CLIENT.apiKey]);
  });

  it('counts a 409 as a skip without dropping the credential', async () => {
    stubFetch(409);
    const outcome = await postPurchases(CLIENT, [purchase('already-there')]);

    expect(outcome).toEqual({ created: 0, skipped: 1, failures: [] });
    expect(apiKeyOf(callAt(0).init)).toBe(CLIENT.apiKey);
  });
});

describe('the credentialled path end to end', () => {
  it('sends the resolved key on every request a real backfill makes', async () => {
    stubFetch(201);
    const client = createIngestClient({ [INGEST_API_KEY_ENV]: 'pops_sa_env.secret' });

    await upsertSource(client, SOURCE);
    await postPurchases(client, [purchase('order-1'), purchase('order-2')]);

    expect(calls).toHaveLength(3);
    for (const { url, init } of calls) {
      expect(url.startsWith(DEFAULT_BASE_URL)).toBe(true);
      expect(apiKeyOf(init)).toBe('pops_sa_env.secret');
    }
  });
});
