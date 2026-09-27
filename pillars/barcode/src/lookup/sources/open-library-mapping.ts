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

/** Work-level fields used to enrich an Open Library edition. */
export interface OpenLibraryWork {
  readonly description?: string;
  readonly subjects: readonly string[];
}

/** Map an Open Library edition and optional work into the canonical product shape. */
export function mapOpenLibraryProduct(
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

  return {
    code: isbn13,
    kind: 'book',
    title,
    contributors,
    subjects,
    imageUrls: readImageUrls(edition['covers']),
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
