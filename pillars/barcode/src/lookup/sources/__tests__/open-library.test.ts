import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenLibrarySource } from '../open-library.js';

const ISBN = '9780330423304';
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

function openLibrarySource(fetcher: typeof fetch): ReturnType<typeof createOpenLibrarySource> {
  return createOpenLibrarySource({ userAgentContact: 'ci@example.invalid', fetch: fetcher });
}

function useFakeProviderTimeout(): void {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  });
}

describe('createOpenLibrarySource', () => {
  it('follows an edition redirect and maps edition, author, and work data', async () => {
    const editionUrl = `https://openlibrary.org/isbn/${ISBN}.json`;
    const redirectedUrl = 'https://openlibrary.org/books/OL123M.json';
    const { fetcher, calls } = makeFetcher((url, init) => {
      expect(init.redirect).toBe('follow');
      expect(init.headers).toEqual({ 'User-Agent': 'pops-barcode/0.1.0 (ci@example.invalid)' });
      if (url === editionUrl) return fetcher(redirectedUrl, init);
      if (url === redirectedUrl) return response('edition-redirect.json');
      if (url.endsWith('/authors/OL26320A.json')) return response('author-tolkien.json');
      if (url.endsWith('/authors/OL123456A.json')) return response('author-lewis.json');
      if (url.endsWith('/works/OL27448W.json')) return response('work-hobbit.json');
      throw new Error(`unexpected URL: ${url}`);
    });

    const result = await openLibrarySource(fetcher).lookUp(ISBN, new AbortController().signal);

    expect(result).toMatchObject({
      kind: 'hit',
      product: {
        code: ISBN,
        kind: 'book',
        title: 'The Hobbit',
        subtitle: 'There and Back Again',
        contributors: [
          { name: 'J.R.R. Tolkien', role: 'author' },
          { name: 'C.S. Lewis', role: 'author' },
        ],
        publisher: 'George Allen & Unwin',
        publishedDate: '1937',
        pageCount: 310,
        language: 'eng',
        description: 'A reluctant hero leaves home.',
        subjects: ['Fantasy', 'Hobbits', 'Adventure'],
        imageUrls: ['https://covers.openlibrary.org/b/id/12345-L.jpg'],
        source: 'open_library',
        attributes: {
          publish_places: 'London',
          edition_name: 'First edition',
        },
      },
    });
    expect(calls).toContain(editionUrl);
    expect(calls).toContain(redirectedUrl);
    expect(result).toHaveProperty('product.fetchedAt');
    if (result.kind === 'hit') {
      for (const key of [
        'isbn_10',
        'isbn_13',
        'identifiers',
        'lccn',
        'oclc_numbers',
        'key',
        'works',
        'authors',
        'covers',
      ]) {
        expect(result.product.attributes).not.toHaveProperty(key);
      }
      expect(result.product.attributes).not.toHaveProperty('nested_fact');
      expect(result.product.attributes).not.toHaveProperty('array_of_objects');
    }
  });

  it('keeps the hit when every author enrichment request fails', async () => {
    const { fetcher } = makeFetcher((url) => {
      if (url.includes('/isbn/')) return response('edition-redirect.json');
      if (url.includes('/authors/')) return response('edition-429.json', 500);
      if (url.includes('/works/')) return response('work-hobbit.json');
      throw new Error(`unexpected URL: ${url}`);
    });

    const result = await openLibrarySource(fetcher).lookUp(ISBN, new AbortController().signal);

    expect(result).toMatchObject({ kind: 'hit', product: { contributors: [] } });
  });

  it('keeps edition data when work enrichment times out', async () => {
    useFakeProviderTimeout();
    const { fetcher } = makeFetcher((url, init) => {
      if (url.includes('/isbn/')) return response('edition-redirect.json');
      if (url.endsWith('/authors/OL26320A.json')) return response('author-tolkien.json');
      if (url.includes('/authors/')) return response('author-lewis.json');
      if (url.includes('/works/')) {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        });
      }
      throw new Error(`unexpected URL: ${url}`);
    });

    const resultPromise = openLibrarySource(fetcher).lookUp(ISBN, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(4_000);
    const result = await resultPromise;

    expect(result).toMatchObject({
      kind: 'hit',
      product: {
        contributors: [
          { name: 'J.R.R. Tolkien', role: 'author' },
          { name: 'C.S. Lewis', role: 'author' },
        ],
        subjects: ['Fantasy', 'Hobbits'],
      },
    });
    if (result.kind === 'hit') expect(result.product).not.toHaveProperty('description');
  });

  it.each([
    ['edition-404.json', 404, 'miss'],
    ['edition-429.json', 429, 'unavailable'],
  ] as const)('maps an edition HTTP response', async (name, status, kind) => {
    const { fetcher } = makeFetcher((url) => {
      if (url.includes('/isbn/')) return response(name, status);
      throw new Error(`unexpected URL: ${url}`);
    });

    await expect(
      openLibrarySource(fetcher).lookUp(ISBN, new AbortController().signal)
    ).resolves.toEqual({
      kind,
    });
  });

  it('returns unavailable for malformed edition JSON', async () => {
    const { fetcher } = makeFetcher((url) => {
      if (url.includes('/isbn/')) return response('edition-malformed.json');
      throw new Error(`unexpected URL: ${url}`);
    });

    await expect(
      openLibrarySource(fetcher).lookUp(ISBN, new AbortController().signal)
    ).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('returns unavailable for an edition network error', async () => {
    const { fetcher } = makeFetcher(() => {
      throw new Error('network failure');
    });

    await expect(
      openLibrarySource(fetcher).lookUp(ISBN, new AbortController().signal)
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('returns unavailable when the edition request takes longer than four seconds', async () => {
    useFakeProviderTimeout();
    const { fetcher } = makeFetcher((url, init) => {
      if (!url.includes('/isbn/')) throw new Error(`unexpected URL: ${url}`);
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });

    const resultPromise = openLibrarySource(fetcher).lookUp(ISBN, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(resultPromise).resolves.toEqual({ kind: 'unavailable' });
  });

  it('preserves a year-only publication date', async () => {
    const { fetcher } = makeFetcher((url) => {
      if (url.includes('/isbn/')) return response('edition-year-only.json');
      throw new Error(`unexpected URL: ${url}`);
    });

    await expect(
      openLibrarySource(fetcher).lookUp(ISBN, new AbortController().signal)
    ).resolves.toMatchObject({ kind: 'hit', product: { publishedDate: '2026' } });
  });
});
