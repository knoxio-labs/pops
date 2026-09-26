import { readFileSync } from 'node:fs';

import { fetchJson } from './http.js';
import {
  asRecord,
  attributesFromRecord,
  readDescription,
  readPositiveInteger,
  readPublishedDate,
  readString,
  readStringList,
} from './mapping.js';

import type { Product } from '../product.js';
import type { BookSource, SourceAnswer } from '../source.js';

const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1/volumes';
const GOOGLE_BOOKS_API_KEY_FILE_ENV = 'BARCODE_GOOGLE_BOOKS_API_KEY_FILE';
const GOOGLE_BOOKS_API_KEY_ENV = 'BARCODE_GOOGLE_BOOKS_API_KEY';
const GOOGLE_BOOKS_ATTRIBUTE_DROP_KEYS = new Set([
  'industryIdentifiers',
  'imageLinks',
  'previewLink',
  'infoLink',
  'canonicalVolumeLink',
  'title',
  'subtitle',
  'authors',
  'publisher',
  'publishedDate',
  'pageCount',
  'language',
  'description',
  'categories',
]);

/** Options for constructing the Google Books source. */
export interface GoogleBooksSourceOptions {
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
}

/**
 * Resolve the Google Books API key, preferring a mounted secret file over the
 * local-development environment variable.
 */
export function resolveGoogleBooksApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const filePath = env[GOOGLE_BOOKS_API_KEY_FILE_ENV]?.trim();
  if (filePath !== undefined && filePath !== '') {
    try {
      const fromFile = readFileSync(filePath, 'utf8').trim();
      if (fromFile !== '') return fromFile;
    } catch (error) {
      console.warn(
        `[barcode-api] could not read ${GOOGLE_BOOKS_API_KEY_FILE_ENV} (${filePath}): ` +
          `${error instanceof Error ? error.message : String(error)} — ` +
          `falling back to ${GOOGLE_BOOKS_API_KEY_ENV}`
      );
    }
  }
  const fromEnv = env[GOOGLE_BOOKS_API_KEY_ENV]?.trim();
  return fromEnv === undefined || fromEnv === '' ? undefined : fromEnv;
}

/** Create the Google Books ISBN source. A missing key makes it unavailable. */
export function createGoogleBooksSource(options: GoogleBooksSourceOptions = {}): BookSource {
  const fetcher = options.fetch ?? fetch;
  const configuredKey = options.apiKey?.trim();

  return {
    id: 'google_books',
    async lookUp(isbn13: string, signal: AbortSignal): Promise<SourceAnswer> {
      const apiKey =
        configuredKey === undefined || configuredKey === ''
          ? resolveGoogleBooksApiKey()
          : configuredKey;
      if (apiKey === undefined) return { kind: 'unavailable' };

      return requestGoogleBooks(fetcher, isbn13, apiKey, signal);
    },
  };
}

async function requestGoogleBooks(
  fetcher: typeof fetch,
  isbn13: string,
  apiKey: string,
  signal: AbortSignal
): Promise<SourceAnswer> {
  const result = await fetchJson(
    fetcher,
    `${GOOGLE_BOOKS_BASE_URL}?q=isbn:${isbn13}&key=${encodeURIComponent(apiKey)}`,
    signal,
    {}
  );
  if (result === undefined || !result.response.ok || result.body === undefined) {
    return { kind: 'unavailable' };
  }

  return mapGoogleBooksResponse(isbn13, result.body);
}

function mapGoogleBooksResponse(isbn13: string, rawBody: unknown): SourceAnswer {
  const body = asRecord(rawBody);
  const totalItems = body?.['totalItems'];
  if (totalItems === 0) return { kind: 'miss' };
  if (typeof totalItems !== 'number' || totalItems < 0) return { kind: 'unavailable' };

  const items = Array.isArray(body?.['items']) ? body['items'] : [];
  const volume = asRecord(items[0]);
  const volumeInfo = asRecord(volume?.['volumeInfo']);
  const product = volumeInfo === undefined ? undefined : mapProduct(isbn13, volumeInfo);
  return product === undefined ? { kind: 'unavailable' } : { kind: 'hit', product };
}

function mapProduct(isbn13: string, volumeInfo: Record<string, unknown>): Product | undefined {
  const title = readString(volumeInfo['title']);
  if (title === undefined) return undefined;

  const subtitle = readString(volumeInfo['subtitle']);
  const contributors = readStringList(volumeInfo['authors']).map((name) => ({
    name,
    role: 'author',
  }));
  const publisher = readString(volumeInfo['publisher']);
  const publishedDate = readPublishedDate(volumeInfo['publishedDate']);
  const pageCount = readPositiveInteger(volumeInfo['pageCount']);
  const language = readString(volumeInfo['language']);
  const description = readDescription(volumeInfo['description']);
  const subjects = readStringList(volumeInfo['categories']);
  const imageUrls = readImageUrls(volumeInfo['imageLinks']);

  return {
    code: isbn13,
    kind: 'book',
    title,
    contributors,
    subjects,
    imageUrls,
    source: 'google_books',
    fetchedAt: new Date().toISOString(),
    attributes: attributesFromRecord(volumeInfo, GOOGLE_BOOKS_ATTRIBUTE_DROP_KEYS),
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(publisher === undefined ? {} : { publisher }),
    ...(publishedDate === undefined ? {} : { publishedDate }),
    ...(pageCount === undefined ? {} : { pageCount }),
    ...(language === undefined ? {} : { language }),
    ...(description === undefined ? {} : { description }),
  };
}

function readImageUrls(value: unknown): string[] {
  const links = asRecord(value);
  if (links === undefined) return [];
  return Object.values(links)
    .map(readString)
    .filter((url): url is string => url !== undefined);
}
