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
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AuthFailureError,
  createIngestClient,
  DEFAULT_BASE_URL,
  INGEST_API_KEY_ENV,
  isCliEntrypoint,
  postPurchases,
  runCli,
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

/**
 * A fetch that answers the nth request with `statuses[n]`, so a test states
 * the sequence it drives rather than encoding it as arithmetic on the call
 * count. A request past the end of the sequence is a failure: these tests are
 * about how many requests go out, so an unplanned one must not be answered.
 */
function stubFetchSequence(statuses: readonly number[]): void {
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const status = statuses[calls.length - 1];
    if (status === undefined) {
      throw new Error(`unplanned request ${String(calls.length)} of ${String(statuses.length)}`);
    }
    return Promise.resolve(new Response('nope', { status }));
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

/**
 * Drive `postPurchases` to the auth failure it should stop on, narrowing to
 * it soundly. A run that completes, or that throws anything else, fails here
 * rather than at an assertion on properties of something that was never an
 * `AuthFailureError`.
 */
async function authFailureFrom(
  purchases: readonly CreatePurchaseInput[]
): Promise<AuthFailureError> {
  const caught: unknown = await postPurchases(CLIENT, purchases).then(
    () => undefined,
    (error: unknown) => error
  );
  if (caught instanceof AuthFailureError) return caught;
  throw new Error(`the run did not stop with an AuthFailureError, it gave ${String(caught)}`);
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

  it('keeps sending the key after a rejected order, and keeps going', async () => {
    stubFetchSequence([422, 201]);

    const outcome = await postPurchases(CLIENT, [purchase('bad'), purchase('good')]);

    expect(outcome.created).toBe(1);
    expect(outcome.failures).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls.map(({ init }) => apiKeyOf(init))).toEqual([CLIENT.apiKey, CLIENT.apiKey]);
  });

  it('counts a 409 as a skip without dropping the credential', async () => {
    stubFetch(409);
    const outcome = await postPurchases(CLIENT, [purchase('already-there')]);

    expect(outcome).toEqual({ created: 0, skipped: 1, failures: [] });
    expect(apiKeyOf(callAt(0).init)).toBe(CLIENT.apiKey);
  });

  it('stops the run on a mid-run 403 instead of reporting one failure per remaining order', async () => {
    stubFetchSequence([201, 201, 403]);

    const promise = postPurchases(CLIENT, [
      purchase('order-1'),
      purchase('order-2'),
      purchase('order-3'),
      purchase('order-4'),
    ]);

    await expect(promise).rejects.toThrow(AuthFailureError);
    expect(calls).toHaveLength(3);
  });

  it('names the status and how many orders were written before a 401 stopped the run', async () => {
    stubFetchSequence([201, 401]);

    const error = await authFailureFrom([purchase('order-1'), purchase('order-2')]);

    expect(error.status).toBe(401);
    expect(error.outcome).toEqual({ created: 1, skipped: 0, failures: [] });
    expect(error.message).toContain('401');
    expect(error.message).toContain('1 order(s) were written');
  });

  it('carries the skips and the failure lines it had already collected', async () => {
    stubFetchSequence([409, 422, 409, 403]);

    const error = await authFailureFrom([
      purchase('already-there'),
      purchase('bad'),
      purchase('also-there'),
      purchase('order-4'),
    ]);

    expect(error.outcome.skipped).toBe(2);
    expect(error.outcome.failures).toEqual(['bad -> 422 nope']);
    expect(error.message).toContain('2 were already present');
  });

  it('runs the before-request hook ahead of the request it belongs to', async () => {
    // A purchase can name a file the request does not carry, and those bytes
    // have to be on the volume before the row that points at them exists.
    const events: string[] = [];
    calls = [];
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, init });
      events.push('request');
      return Promise.resolve(new Response('{}', { status: 201 }));
    });

    await postPurchases(CLIENT, [purchase('order-1')], {
      beforeRequest: () => events.push('before'),
      afterCreated: () => events.push('created'),
    });

    expect(events).toEqual(['before', 'request', 'created']);
  });

  it('does not report an order as created when it already existed', async () => {
    stubFetch(409);
    const created: string[] = [];

    await postPurchases(CLIENT, [purchase('already-there')], {
      afterCreated: ({ sourceOrderId }) => created.push(sourceOrderId ?? ''),
    });

    expect(created).toEqual([]);
  });

  it('does not report an order as created when the write failed', async () => {
    stubFetch(422);
    const created: string[] = [];

    await postPurchases(CLIENT, [purchase('bad')], {
      afterCreated: ({ sourceOrderId }) => created.push(sourceOrderId ?? ''),
    });

    expect(created).toEqual([]);
  });

  it('leaves the purchases after an auth stop with neither hook called', async () => {
    stubFetchSequence([201, 403]);
    const before: string[] = [];
    const created: string[] = [];

    await expect(
      postPurchases(CLIENT, [purchase('order-1'), purchase('order-2'), purchase('order-3')], {
        beforeRequest: ({ sourceOrderId }) => before.push(sourceOrderId ?? ''),
        afterCreated: ({ sourceOrderId }) => created.push(sourceOrderId ?? ''),
      })
    ).rejects.toThrow(AuthFailureError);

    expect(before).toEqual(['order-1', 'order-2']);
    expect(created).toEqual(['order-1']);
  });
});

describe('runCli', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('leaves the exit code untouched when main succeeds', async () => {
    await runCli(() => Promise.resolve());

    expect(process.exitCode).toBeUndefined();
  });

  it('prints a config error as a message, not a stack trace, and fails the run', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runCli(() =>
      Promise.reject(new Error(`no service-account key: set ${INGEST_API_KEY_ENV}`))
    );

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(`no service-account key: set ${INGEST_API_KEY_ENV}`);
    errorSpy.mockRestore();
  });

  it('reports what an aborted run had already done before printing why it stopped', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stopped = new AuthFailureError(403, {
      created: 2,
      skipped: 30,
      failures: ['bad -> 422 malformed'],
    });

    await runCli(() => Promise.reject(stopped));

    expect(warnSpy).toHaveBeenCalledWith('created 2, skipped 30, failed 1');
    expect(errorSpy).toHaveBeenCalledWith('  bad -> 422 malformed');
    expect(errorSpy).toHaveBeenCalledWith(stopped.message);
    expect(process.exitCode).toBe(1);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('stringifies a non-Error rejection rather than throwing out of the run', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await runCli(() => Promise.reject('boom'));

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('boom');
    errorSpy.mockRestore();
  });
});

describe('the CLI entrypoint guard', () => {
  const here = fileURLToPath(import.meta.url);

  it('recognises the entry path the process was actually started with', () => {
    expect(isCliEntrypoint(import.meta.url, here)).toBe(true);
  });

  it('recognises an entry path given relative to the working directory', () => {
    expect(isCliEntrypoint(import.meta.url, relative(process.cwd(), here))).toBe(true);
  });

  it('recognises an entry path that a file URL has to percent-encode', () => {
    const entryPath = join('/srv', 'My Projects', 'pops', 'scripts', 'ingest-amazon.ts');
    const moduleUrl = pathToFileURL(entryPath).href;

    expect(moduleUrl).toContain('My%20Projects');
    // The form this replaced: an unencoded path against an encoded URL, which
    // never matches and leaves the CLI doing nothing at all.
    expect(moduleUrl === `file://${entryPath}`).toBe(false);
    expect(isCliEntrypoint(moduleUrl, entryPath)).toBe(true);
  });

  it('stays false when the module is imported by some other entry point', () => {
    expect(isCliEntrypoint(import.meta.url, join(dirname(here), 'ingest-woolworths.ts'))).toBe(
      false
    );
  });

  it('stays false when there is no entry path at all', () => {
    expect(isCliEntrypoint(import.meta.url, undefined)).toBe(false);
    expect(isCliEntrypoint(import.meta.url, '')).toBe(false);
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
