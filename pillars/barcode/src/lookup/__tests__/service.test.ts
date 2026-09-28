import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runWithRequestId } from '@pops/pillar-sdk/server';

import { openBarcodeDb, type OpenedBarcodeDb } from '../../db/index.js';
import {
  createBarcodeLookupService,
  SOURCE_BUDGET_MS,
  type BarcodeLookupLogger,
} from '../service.js';

import type { Product } from '../product.js';
import type { BookSource } from '../source.js';

const product: Product = {
  code: '9780330423304',
  kind: 'book',
  title: 'A Book',
  contributors: [{ name: 'An Author', role: 'author' }],
  subjects: ['fiction'],
  imageUrls: ['https://example.com/cover.jpg'],
  source: 'open_library',
  language: 'eng',
  fetchedAt: '2026-09-26T00:00:00.000Z',
  attributes: {},
};

let directory: string | undefined;
let opened: OpenedBarcodeDb | undefined;

afterEach(() => {
  vi.useRealTimers();
  opened?.raw.close();
  opened = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function service(
  sources: readonly BookSource[],
  now = () => new Date('2026-09-26T00:00:00.000Z'),
  logger?: BarcodeLookupLogger
) {
  directory = mkdtempSync(join(tmpdir(), 'barcode-service-test-'));
  opened = openBarcodeDb(join(directory, 'barcode.db'));
  return createBarcodeLookupService({
    db: opened.db,
    sources,
    now,
    ...(logger === undefined ? {} : { logger }),
  });
}

function source(id: BookSource['id'], lookUp: BookSource['lookUp']): BookSource {
  return { id, lookUp };
}

describe('createBarcodeLookupService', () => {
  it('returns the first source hit', async () => {
    const calls: string[] = [];
    const lookup = service([
      source('open_library', async (isbn) => {
        calls.push(isbn);
        return { kind: 'hit', product };
      }),
    ]);

    await expect(lookup.lookup('978-0-330-42330-4')).resolves.toEqual({
      outcome: 'found',
      product,
    });
    expect(calls).toEqual(['9780330423304']);
  });

  it('continues after a miss and returns the next hit', async () => {
    const calls: string[] = [];
    const lookup = service([
      source('open_library', async (isbn) => {
        calls.push(`open:${isbn}`);
        return { kind: 'miss' };
      }),
      source('google_books', async (isbn) => {
        calls.push(`google:${isbn}`);
        return { kind: 'hit', product: { ...product, source: 'google_books' } };
      }),
    ]);

    await expect(lookup.lookup('9780330423304')).resolves.toMatchObject({
      outcome: 'found',
      product: { source: 'google_books' },
    });
    expect(calls).toHaveLength(2);
  });

  it('continues after a partial hit and merges metadata from the next provider', async () => {
    let calls = 0;
    const partial: Product = { ...product, contributors: [] };
    const lookup = service([
      source('open_library', async () => {
        calls += 1;
        return { kind: 'hit', product: partial };
      }),
      source('google_books', async () => {
        calls += 1;
        return {
          kind: 'hit',
          product: {
            ...product,
            source: 'google_books',
            publisher: 'Second Provider Press',
          },
        };
      }),
    ]);

    await expect(lookup.lookup('9780330423304')).resolves.toMatchObject({
      outcome: 'found',
      product: {
        source: 'open_library',
        contributors: [{ name: 'An Author', role: 'author' }],
        publisher: 'Second Provider Press',
      },
    });
    expect(calls).toBe(2);
  });

  it('enriches the ISBN that previously returned an authorless match', async () => {
    const code = '9788581051130';
    const partial: Product = {
      ...product,
      code,
      contributors: [],
      language: 'por',
    };
    const complete: Product = {
      ...product,
      code,
      language: 'por',
    };
    const lookup = service([
      source('open_library', async (isbn) => {
        expect(isbn).toBe(code);
        return { kind: 'hit', product: partial };
      }),
      source('google_books', async (isbn) => {
        expect(isbn).toBe(code);
        return { kind: 'hit', product: { ...complete, source: 'google_books' } };
      }),
    ]);

    await expect(lookup.lookup(code)).resolves.toMatchObject({
      outcome: 'found',
      product: { code, language: 'por', contributors: [{ name: 'An Author' }] },
    });
  });

  it.each(['9788599296493', '9788535918670'])(
    'attempts both providers for the ISBN that previously failed instantly: %s',
    async (code) => {
      const calls: string[] = [];
      const lookup = service([
        source('open_library', async (isbn) => {
          calls.push(`open:${isbn}`);
          return { kind: 'miss' };
        }),
        source('google_books', async (isbn) => {
          calls.push(`google:${isbn}`);
          return { kind: 'miss' };
        }),
      ]);

      await expect(lookup.lookup(code)).resolves.toEqual({ outcome: 'not_found' });
      expect(calls).toEqual([`open:${code}`, `google:${code}`]);
    }
  );

  it('revalidates an incomplete product instead of caching it', async () => {
    let calls = 0;
    const partial: Product = { ...product, contributors: [] };
    const lookup = service([
      source('open_library', async () => {
        calls += 1;
        return calls === 1 ? { kind: 'hit', product: partial } : { kind: 'hit', product };
      }),
    ]);

    await expect(lookup.lookup('9780330423304')).resolves.toMatchObject({
      outcome: 'found',
      product: { contributors: [] },
    });
    await expect(lookup.lookup('9780330423304')).resolves.toMatchObject({
      outcome: 'found',
      product,
    });
    expect(calls).toBe(2);
  });

  it('caches an all-miss result', async () => {
    let calls = 0;
    const lookup = service([
      source('open_library', async () => {
        calls += 1;
        return { kind: 'miss' };
      }),
      source('google_books', async () => {
        calls += 1;
        return { kind: 'miss' };
      }),
    ]);

    await expect(lookup.lookup('9780330423304')).resolves.toEqual({ outcome: 'not_found' });
    await expect(lookup.lookup('9780330423304')).resolves.toEqual({ outcome: 'not_found' });
    expect(calls).toBe(2);
  });

  it('returns unavailable after an unavailable source and a miss without caching it', async () => {
    let calls = 0;
    const lookup = service([
      source('open_library', async () => {
        calls += 1;
        return { kind: 'unavailable' };
      }),
      source('google_books', async () => {
        calls += 1;
        return { kind: 'miss' };
      }),
    ]);

    await expect(lookup.lookup('9780330423304')).resolves.toMatchObject({
      outcome: 'unavailable',
      error: { code: 'barcode.lookup.provider_unavailable', retryable: true },
    });
    await expect(lookup.lookup('9780330423304')).resolves.toMatchObject({
      outcome: 'unavailable',
      error: { code: 'barcode.lookup.provider_unavailable', retryable: true },
    });
    expect(calls).toBe(4);
  });

  it('treats a thrown adapter as unavailable', async () => {
    const lookup = service([
      source('open_library', async () => {
        throw new Error('provider failed');
      }),
    ]);

    await expect(lookup.lookup('9780330423304')).resolves.toMatchObject({
      outcome: 'unavailable',
      error: { code: 'barcode.lookup.provider_unavailable', retryable: true },
    });
  });

  it('returns unavailable when the shared eight-second budget elapses', async () => {
    vi.useFakeTimers();
    const lookup = service([
      source(
        'open_library',
        (_isbn, signal) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
            void resolve;
          })
      ),
    ]);

    const result = lookup.lookup('9780330423304');
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(result).resolves.toMatchObject({
      outcome: 'unavailable',
      error: { code: 'barcode.lookup.timeout', retryable: true },
    });
  });

  it('moves to the next source after one four-second source budget', async () => {
    vi.useFakeTimers();
    let firstSourceAborted = false;
    let secondSourceCalls = 0;
    const lookup = service([
      source(
        'open_library',
        (_isbn, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                firstSourceAborted = signal.aborted;
                reject(new Error('aborted'));
              },
              { once: true }
            );
          })
      ),
      source('google_books', async () => {
        secondSourceCalls += 1;
        return { kind: 'hit', product: { ...product, source: 'google_books' } };
      }),
    ]);

    const result = lookup.lookup('9780330423304');
    await vi.advanceTimersByTimeAsync(SOURCE_BUDGET_MS);

    await expect(result).resolves.toMatchObject({
      outcome: 'found',
      product: { source: 'google_books' },
    });
    expect(firstSourceAborted).toBe(true);
    expect(secondSourceCalls).toBe(1);
  });

  it('does not call an adapter for a valid non-book code', async () => {
    let calls = 0;
    const lookup = service([
      source('open_library', async () => {
        calls += 1;
        return { kind: 'hit', product };
      }),
    ]);

    await expect(lookup.lookup('9771234567898')).resolves.toEqual({
      outcome: 'not_found',
      reason: 'unsupported',
    });
    expect(calls).toBe(0);
  });

  it('logs safe provider attempts and a correlated outcome without the barcode or exception', async () => {
    const info = vi.fn<BarcodeLookupLogger['info']>();
    const lookup = service(
      [
        source('open_library', async () => {
          throw new Error('private provider response');
        }),
      ],
      undefined,
      { info }
    );

    const result = await runWithRequestId('barcode-request-5050', () =>
      lookup.lookup('9780330423304')
    );

    expect(result).toMatchObject({
      outcome: 'unavailable',
      error: {
        code: 'barcode.lookup.provider_unavailable',
        requestId: 'barcode-request-5050',
        retryable: true,
      },
    });
    expect(info).toHaveBeenCalledWith(
      'barcode provider attempt',
      expect.objectContaining({
        requestId: 'barcode-request-5050',
        source: 'open_library',
        outcome: 'unavailable',
        failureClass: 'provider_unavailable',
        durationMs: expect.any(Number),
      })
    );
    expect(info).toHaveBeenCalledWith(
      'barcode lookup outcome',
      expect.objectContaining({
        requestId: 'barcode-request-5050',
        outcome: 'unavailable',
        failureClass: 'barcode.lookup.provider_unavailable',
        retryable: true,
      })
    );
    const serialisedLogs = JSON.stringify(info.mock.calls);
    expect(serialisedLogs).not.toContain('9780330423304');
    expect(serialisedLogs).not.toContain('private provider response');
  });

  it('logs a provider rate limit with its safe status', async () => {
    const info = vi.fn<BarcodeLookupLogger['info']>();
    const lookup = service(
      [
        source('google_books', async () => ({
          kind: 'unavailable',
          failureClass: 'rate_limited',
          status: 429,
        })),
      ],
      undefined,
      { info }
    );

    await lookup.lookup('9780330423304');

    expect(info).toHaveBeenCalledWith(
      'barcode provider attempt',
      expect.objectContaining({
        source: 'google_books',
        outcome: 'unavailable',
        failureClass: 'rate_limited',
        providerStatus: 429,
      })
    );
  });

  it('does not call an adapter on a cache hit', async () => {
    let calls = 0;
    const lookup = service([
      source('open_library', async () => {
        calls += 1;
        return { kind: 'hit', product };
      }),
    ]);

    await lookup.lookup('9780330423304');
    await expect(lookup.lookup('9780330423304')).resolves.toEqual({ outcome: 'found', product });
    expect(calls).toBe(1);
  });

  it('refetches an expired entry', async () => {
    let current = new Date('2026-09-26T00:00:00.000Z');
    let calls = 0;
    const lookup = service(
      [
        source('open_library', async () => {
          calls += 1;
          return { kind: 'miss' };
        }),
      ],
      () => current
    );

    await lookup.lookup('9780330423304');
    current = new Date('2026-09-27T00:00:01.000Z');
    await lookup.lookup('9780330423304');
    expect(calls).toBe(2);
  });
});
