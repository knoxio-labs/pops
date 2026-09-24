import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '../remote-entry/index.js';

type Catalogue = Readonly<Record<string, unknown>>;

function isCatalogue(value: unknown): value is Catalogue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Dotted path → value for every string leaf, with a line per bad leaf. */
function flatten(
  catalogue: Catalogue,
  prefix = ''
): { entries: Map<string, string>; badLeaves: string[] } {
  const entries = new Map<string, string>();
  const badLeaves: string[] = [];
  for (const [key, value] of Object.entries(catalogue)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') {
      entries.set(path, value);
    } else if (isCatalogue(value)) {
      const nested = flatten(value, path);
      for (const [nestedPath, nestedValue] of nested.entries) entries.set(nestedPath, nestedValue);
      badLeaves.push(...nested.badLeaves);
    } else {
      badLeaves.push(`"${path}" holds ${kindOf(value)}; expected a string or a nested object`);
    }
  }
  return { entries, badLeaves };
}

function shapeProblems(
  locale: SupportedLocale,
  catalogue: unknown,
  into: Map<string, string>
): string[] {
  if (!isCatalogue(catalogue)) return [`${locale} catalogue is not a JSON object`];
  const { entries, badLeaves } = flatten(catalogue);
  for (const [path, value] of entries) into.set(path, value);
  const empty = [...entries].filter(([, value]) => value.trim() === '').map(([path]) => path);
  return [
    ...badLeaves.map((line) => `${locale} ${line}`),
    ...empty.map((path) => `${locale} "${path}" is empty`),
  ];
}

function parityProblems(
  locale: SupportedLocale,
  entries: ReadonlyMap<string, string>,
  reference: ReadonlyMap<string, string>
): string[] {
  const missing = [...reference.keys()].filter((path) => !entries.has(path)).toSorted();
  const extra = [...entries.keys()].filter((path) => !reference.has(path)).toSorted();
  return [
    ...missing.map((path) => `${locale} is missing "${path}"`),
    ...extra.map((path) => `${locale} has "${path}", which ${DEFAULT_LOCALE} lacks`),
  ];
}

/**
 * Every way one namespace's catalogues fall short of shipping in all
 * {@link SUPPORTED_LOCALES}, as readable lines; empty when they are in step.
 *
 * Reported per locale: a catalogue that is not a JSON object, a leaf that is
 * neither a string nor a nested object, an empty or whitespace-only value, and
 * any key present in {@link DEFAULT_LOCALE} and missing from another locale or
 * the reverse. Nested sections are compared by their dotted path, the same
 * string a `t()` call looks them up by.
 *
 * Nothing generates one locale from another, and i18next's fallback hides a
 * missing key at runtime as English text inside a Portuguese page, so each
 * unit that owns a namespace asserts this is empty in its own tests.
 *
 * @param catalogues The namespace's catalogue for each supported locale, as
 *   parsed JSON.
 * @returns One line per problem: shape problems in locale order, then parity
 *   problems in locale then key order.
 */
export function localeCatalogueProblems(
  catalogues: Readonly<Record<SupportedLocale, unknown>>
): string[] {
  const flat = new Map<SupportedLocale, Map<string, string>>();
  const problems: string[] = [];
  for (const locale of SUPPORTED_LOCALES) {
    const entries = new Map<string, string>();
    flat.set(locale, entries);
    problems.push(...shapeProblems(locale, catalogues[locale], entries));
  }

  const reference = flat.get(DEFAULT_LOCALE) ?? new Map<string, string>();
  for (const locale of SUPPORTED_LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    problems.push(...parityProblems(locale, flat.get(locale) ?? new Map(), reference));
  }
  return problems;
}
