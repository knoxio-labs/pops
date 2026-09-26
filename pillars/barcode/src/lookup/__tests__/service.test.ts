import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openBarcodeDb, type OpenedBarcodeDb } from '../../db/index.js';
import { createBarcodeLookupService, SOURCE_BUDGET_MS } from '../service.js';

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

function service(sources: readonly BookSource[], now = () => new Date('2026-09-26T00:00:00.000Z')) {
  directory = mkdtempSync(join(tmpdir(), 'barcode-service-test-'));
  opened = openBarcodeDb(join(directory, 'barcode.db'));
  return createBarcodeLookupService({ db: opened.db, sources, now });
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

    await expect(lookup.lookup('9780330423304')).resolves.toEqual({ outcome: 'unavailable' });
    await expect(lookup.lookup('9780330423304')).resolves.toEqual({ outcome: 'unavailable' });
    expect(calls).toBe(4);
  });

  it('treats a thrown adapter as unavailable', async () => {
    const lookup = service([
      source('open_library', async () => {
        throw new Error('provider failed');
      }),
    ]);

    await expect(lookup.lookup('9780330423304')).resolves.toEqual({ outcome: 'unavailable' });
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
    await expect(result).resolves.toEqual({ outcome: 'unavailable' });
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

    await expect(lookup.lookup('9771234567898')).resolves.toEqual({ outcome: 'not_found' });
    expect(calls).toBe(0);
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
