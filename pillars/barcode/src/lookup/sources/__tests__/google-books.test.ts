import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGoogleBooksSource } from '../google-books.js';

const ISBN = '9780330423304';
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

let directory: string | undefined;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function response(name: string, status = 200): Response {
  return new Response(fixture(name), { status });
}

function makeFetcher(
  implementation: (url: string, init: FetchInit) => Response | Promise<Response>
): { readonly fetcher: typeof fetch; readonly calls: string[] } {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input: FetchInput, init?: FetchInit) => {
    const url = String(input);
    calls.push(url);
    return implementation(url, init ?? {});
  };
  return { fetcher, calls };
}

function googleBooksSource(fetcher: typeof fetch, apiKey = 'test-key') {
  return createGoogleBooksSource({ apiKey, fetch: fetcher });
}

function useFakeProviderTimeout(): void {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  });
}

describe('createGoogleBooksSource', () => {
  it('maps a full volume and omits provider-only attributes', async () => {
    const { fetcher, calls } = makeFetcher((url) => {
      expect(url).toBe(`https://www.googleapis.com/books/v1/volumes?q=isbn:${ISBN}&key=test-key`);
      return response('volume-full.json');
    });

    const result = await googleBooksSource(fetcher).lookUp(ISBN, new AbortController().signal);

    expect(result).toMatchObject({
      kind: 'hit',
      product: {
        code: ISBN,
        kind: 'book',
        title: 'A Google Book',
        subtitle: 'A Useful Subtitle',
        contributors: [{ name: 'Example Author', role: 'author' }],
        publisher: 'Example Books',
        publishedDate: '2024-05-06',
        pageCount: 240,
        language: 'en',
        description: 'A description from Google Books.',
        subjects: ['Computers', 'Reference'],
        imageUrls: ['https://books.example/small.jpg', 'https://books.example/large.jpg'],
        source: 'google_books',
        attributes: {
          printType: 'BOOK',
          averageRating: '4.5',
          ratingsCount: '12',
          allowAnonLogging: 'true',
        },
      },
    });
    expect(calls).toEqual([
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${ISBN}&key=test-key`,
    ]);
    if (result.kind === 'hit') {
      for (const key of [
        'industryIdentifiers',
        'imageLinks',
        'previewLink',
        'infoLink',
        'canonicalVolumeLink',
      ]) {
        expect(result.product.attributes).not.toHaveProperty(key);
      }
      expect(result.product.attributes).not.toHaveProperty('nestedFact');
      expect(result.product.attributes).not.toHaveProperty('readingModes');
    }
  });

  it('returns a miss when Google Books reports no volumes', async () => {
    const { fetcher } = makeFetcher(() => response('volumes-empty.json'));

    await expect(
      googleBooksSource(fetcher).lookUp(ISBN, new AbortController().signal)
    ).resolves.toEqual({ kind: 'miss' });
  });

  it.each([
    ['volumes-429.json', 429],
    ['volumes-500.json', 500],
  ] as const)('returns unavailable for a provider failure', async (name, status) => {
    const { fetcher } = makeFetcher(() => response(name, status));

    await expect(
      googleBooksSource(fetcher).lookUp(ISBN, new AbortController().signal)
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('returns unavailable for malformed JSON', async () => {
    const { fetcher } = makeFetcher(() => response('volumes-malformed.json'));

    await expect(
      googleBooksSource(fetcher).lookUp(ISBN, new AbortController().signal)
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('returns unavailable for a network error', async () => {
    const { fetcher } = makeFetcher(() => {
      throw new Error('network failure');
    });

    await expect(
      googleBooksSource(fetcher).lookUp(ISBN, new AbortController().signal)
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('uses the file key before the environment key', async () => {
    directory = mkdtempSync(join(tmpdir(), 'barcode-google-books-test-'));
    const filePath = join(directory, 'google-books-key');
    writeFileSync(filePath, 'file-key-placeholder\n', 'utf8');
    vi.stubEnv('BARCODE_GOOGLE_BOOKS_API_KEY_FILE', filePath);
    vi.stubEnv('BARCODE_GOOGLE_BOOKS_API_KEY', 'env-key-placeholder');
    const { fetcher, calls } = makeFetcher(() => response('volumes-empty.json'));

    await createGoogleBooksSource({ fetch: fetcher }).lookUp(ISBN, new AbortController().signal);

    expect(calls[0]).toBe(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${ISBN}&key=file-key-placeholder`
    );
  });

  it('reports unavailable without a key and does not make a keyless request', async () => {
    vi.stubEnv('BARCODE_GOOGLE_BOOKS_API_KEY_FILE', '');
    vi.stubEnv('BARCODE_GOOGLE_BOOKS_API_KEY', '');
    const { fetcher, calls } = makeFetcher(() => response('volumes-empty.json'));

    await expect(
      createGoogleBooksSource({ fetch: fetcher }).lookUp(ISBN, new AbortController().signal)
    ).resolves.toEqual({ kind: 'unavailable' });
    expect(calls).toEqual([]);
  });

  it('returns unavailable when the request takes longer than four seconds', async () => {
    useFakeProviderTimeout();
    const { fetcher } = makeFetcher((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });

    const resultPromise = googleBooksSource(fetcher).lookUp(ISBN, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(resultPromise).resolves.toEqual({ kind: 'unavailable' });
  });
});
