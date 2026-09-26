import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { fetchJson } from './http.js';
import {
  asRecord,
  attributesFromRecord,
  readDescription,
  readFirstString,
  readPositiveInteger,
  readPublishedDate,
  readString,
  readStringList,
} from './mapping.js';

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
const OPEN_LIBRARY_ATTRIBUTE_DROP_KEYS = new Set([
  'isbn_10',
  'isbn_13',
  'identifiers',
  'lccn',
  'oclc_numbers',
  'key',
  'works',
  'authors',
  'covers',
  'title',
  'subtitle',
  'publishers',
  'publisher',
  'publish_date',
  'number_of_pages',
  'languages',
  'language',
  'description',
  'subjects',
]);

/** Options for constructing the Open Library book source. */
export interface OpenLibrarySourceOptions {
  readonly userAgentContact: string;
  readonly fetch?: typeof fetch;
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
      if (edition === undefined) return { kind: 'unavailable' };
      if (edition.response.status === 404) return { kind: 'miss' };
      if (!edition.response.ok || edition.body === undefined) return { kind: 'unavailable' };

      const editionRecord = asRecord(edition.body);
      const title = readString(editionRecord?.['title']);
      if (editionRecord === undefined || title === undefined) return { kind: 'unavailable' };

      const [contributors, work] = await Promise.all([
        loadContributors(editionRecord, fetcher, headers, signal),
        loadWork(editionRecord, fetcher, headers, signal),
      ]);
      const product = mapProduct(isbn13, editionRecord, contributors, work);
      return product === undefined ? { kind: 'unavailable' } : { kind: 'hit', product };
    },
  };
}

interface OpenLibraryWork {
  readonly description?: string;
  readonly subjects: readonly string[];
}

async function loadContributors(
  edition: Record<string, unknown>,
  fetcher: typeof fetch,
  headers: NonNullable<Parameters<typeof fetch>[1]>['headers'],
  signal: AbortSignal
): Promise<Product['contributors']> {
  const authors = Array.isArray(edition['authors']) ? edition['authors'] : [];
  const results = await Promise.all(
    authors.map(async (author): Promise<Product['contributors'][number] | undefined> => {
      const authorRecord = asRecord(author);
      const key = readString(authorRecord?.['key']);
      if (key === undefined) return undefined;
      const result = await fetchJson(
        fetcher,
        `${OPEN_LIBRARY_BASE_URL}${key}.json`,
        signal,
        headers
      );
      if (result === undefined || !result.response.ok || result.body === undefined)
        return undefined;
      const name = readString(asRecord(result.body)?.['name']);
      return name === undefined ? undefined : { name, role: 'author' };
    })
  );
  return results.filter(
    (contributor): contributor is Product['contributors'][number] => contributor !== undefined
  );
}

async function loadWork(
  edition: Record<string, unknown>,
  fetcher: typeof fetch,
  headers: NonNullable<Parameters<typeof fetch>[1]>['headers'],
  signal: AbortSignal
): Promise<OpenLibraryWork | undefined> {
  const works = Array.isArray(edition['works']) ? edition['works'] : [];
  const workKey = readString(asRecord(works[0])?.['key']);
  if (workKey === undefined) return undefined;
  const result = await fetchJson(
    fetcher,
    `${OPEN_LIBRARY_BASE_URL}${workKey}.json`,
    signal,
    headers
  );
  if (result === undefined || !result.response.ok || result.body === undefined) return undefined;
  const work = asRecord(result.body);
  if (work === undefined) return undefined;
  return {
    description: readDescription(work['description']),
    subjects: readStringList(work['subjects']),
  };
}

function mapProduct(
  isbn13: string,
  edition: Record<string, unknown>,
  contributors: Product['contributors'],
  work: OpenLibraryWork | undefined
): Product | undefined {
  const title = readString(edition['title']);
  if (title === undefined) return undefined;
  const subjects = [
    ...new Set([...readStringList(edition['subjects']), ...(work?.subjects ?? [])]),
  ];
  const imageUrls = readImageUrls(edition['covers']);

  return {
    code: isbn13,
    kind: 'book',
    title,
    contributors,
    subjects,
    imageUrls,
    source: 'open_library',
    fetchedAt: new Date().toISOString(),
    attributes: attributesFromRecord(edition, OPEN_LIBRARY_ATTRIBUTE_DROP_KEYS),
    ...readOptionalFields(edition, work),
  };
}

function readOptionalFields(
  edition: Record<string, unknown>,
  work: OpenLibraryWork | undefined
): Pick<
  Product,
  'subtitle' | 'publisher' | 'publishedDate' | 'pageCount' | 'language' | 'description'
> {
  const subtitle = readString(edition['subtitle']);
  const publisher = readString(edition['publisher']) ?? readFirstString(edition['publishers']);
  const publishedDate = readPublishedDate(edition['publish_date']);
  const pageCount = readPositiveInteger(edition['number_of_pages']);
  const language = readLanguage(edition);
  const description = readDescription(edition['description']) ?? work?.description;

  return {
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(publisher === undefined ? {} : { publisher }),
    ...(publishedDate === undefined ? {} : { publishedDate }),
    ...(pageCount === undefined ? {} : { pageCount }),
    ...(language === undefined ? {} : { language }),
    ...(description === undefined ? {} : { description }),
  };
}

function readLanguage(edition: Record<string, unknown>): string | undefined {
  const direct = readString(edition['language']);
  if (direct !== undefined) return direct;
  const languages = Array.isArray(edition['languages']) ? edition['languages'] : [];
  const key = readString(asRecord(languages[0])?.['key']);
  return key?.split('/').at(-1);
}

function readImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(readPositiveInteger)
    .filter((id): id is number => id !== undefined)
    .map((id) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`);
}
