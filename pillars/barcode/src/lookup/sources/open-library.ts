import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { fetchJson } from './http.js';
import { asRecord, readDescription, readString, readStringList } from './mapping.js';
import { mapOpenLibraryProduct, type OpenLibraryWork } from './open-library-mapping.js';

import type { Product } from '../product.js';
import type { BookSource, SourceAnswer } from '../source.js';

const OPEN_LIBRARY_BASE_URL = 'https://openlibrary.org';
const packageMetadata: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json'),
    'utf8'
  )
);
const packageJson = z.object({ version: z.string().min(1) }).parse(packageMetadata);

/** Options for constructing the Open Library book source. */
export interface OpenLibrarySourceOptions {
  readonly userAgentContact: string;
  readonly fetch?: typeof fetch;
}

interface OpenLibraryFetchContext {
  readonly fetcher: typeof fetch;
  readonly headers: NonNullable<Parameters<typeof fetch>[1]>['headers'];
  readonly signal: AbortSignal;
}

/** Create an Open Library ISBN source with the configured identifying contact. */
export function createOpenLibrarySource(options: OpenLibrarySourceOptions): BookSource {
  const fetcher = options.fetch ?? fetch;
  const userAgent = `pops-barcode/${packageJson.version} (${options.userAgentContact.trim()})`;
  const headers = { 'User-Agent': userAgent };

  return {
    id: 'open_library',
    async lookUp(isbn13: string, signal: AbortSignal): Promise<SourceAnswer> {
      const edition = await fetchJson(
        fetcher,
        `${OPEN_LIBRARY_BASE_URL}/isbn/${isbn13}.json`,
        signal,
        headers
      );
      if (edition.kind === 'failure') {
        return { kind: 'unavailable', failureClass: edition.failureClass };
      }
      if (edition.response.status === 404) return { kind: 'miss' };
      if (!edition.response.ok) {
        return {
          kind: 'unavailable',
          failureClass: edition.response.status === 429 ? 'rate_limited' : 'http_error',
          status: edition.response.status,
        };
      }
      if (edition.body === undefined) {
        return { kind: 'unavailable', failureClass: 'invalid_response' };
      }

      const editionRecord = asRecord(edition.body);
      const title = readString(editionRecord?.['title']);
      if (editionRecord === undefined || title === undefined) {
        return { kind: 'unavailable', failureClass: 'invalid_response' };
      }

      const [contributors, work] = await Promise.all([
        loadContributors(editionRecord, isbn13, { fetcher, headers, signal }),
        loadWork(editionRecord, { fetcher, headers, signal }),
      ]);
      const product = mapOpenLibraryProduct(isbn13, editionRecord, contributors, work);
      return product === undefined
        ? { kind: 'unavailable', failureClass: 'invalid_response' }
        : { kind: 'hit', product };
    },
  };
}

async function loadContributors(
  edition: Record<string, unknown>,
  isbn13: string,
  context: OpenLibraryFetchContext
): Promise<Product['contributors']> {
  const authors = Array.isArray(edition['authors']) ? edition['authors'] : [];
  const results = await Promise.all(
    authors.map(async (author): Promise<Product['contributors'][number] | undefined> => {
      const authorRecord = asRecord(author);
      const key = readString(authorRecord?.['key']);
      if (key === undefined) return undefined;
      const result = await fetchJson(
        context.fetcher,
        `${OPEN_LIBRARY_BASE_URL}${key}.json`,
        context.signal,
        context.headers
      );
      if (result.kind === 'failure' || !result.response.ok || result.body === undefined) {
        return undefined;
      }
      const name = readString(asRecord(result.body)?.['name']);
      return name === undefined ? undefined : { name, role: 'author' };
    })
  );
  const contributors = results.filter(
    (contributor): contributor is Product['contributors'][number] => contributor !== undefined
  );
  if (contributors.length > 0) return contributors;
  return loadSearchContributors(isbn13, context);
}

async function loadSearchContributors(
  isbn13: string,
  context: OpenLibraryFetchContext
): Promise<Product['contributors']> {
  const url = new URL(`${OPEN_LIBRARY_BASE_URL}/search.json`);
  url.searchParams.set('isbn', isbn13);
  url.searchParams.set('fields', 'author_name');
  url.searchParams.set('limit', '1');
  const result = await fetchJson(context.fetcher, url.toString(), context.signal, context.headers);
  if (result.kind === 'failure' || !result.response.ok || result.body === undefined) return [];
  const body = asRecord(result.body);
  const document = Array.isArray(body?.['docs']) ? asRecord(body['docs'][0]) : undefined;
  return readStringList(document?.['author_name']).map((name) => ({ name, role: 'author' }));
}

async function loadWork(
  edition: Record<string, unknown>,
  context: OpenLibraryFetchContext
): Promise<OpenLibraryWork | undefined> {
  const works = Array.isArray(edition['works']) ? edition['works'] : [];
  const workKey = readString(asRecord(works[0])?.['key']);
  if (workKey === undefined) return undefined;
  const result = await fetchJson(
    context.fetcher,
    `${OPEN_LIBRARY_BASE_URL}${workKey}.json`,
    context.signal,
    context.headers
  );
  if (result.kind === 'failure' || !result.response.ok || result.body === undefined) {
    return undefined;
  }
  const work = asRecord(result.body);
  if (work === undefined) return undefined;
  return {
    description: readDescription(work['description']),
    subjects: readStringList(work['subjects']),
  };
}
