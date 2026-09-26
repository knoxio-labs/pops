import { z } from 'zod';

const PUBLISHED_DATE_PATTERN = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u;

/** Narrow an unknown provider value to a string-keyed object. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Read a non-empty provider string after trimming surrounding whitespace. */
export function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Read the non-empty strings in a provider array. */
export function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(readString).filter((item): item is string => item !== undefined);
}

/** Read the first non-empty string in a provider array. */
export function readFirstString(value: unknown): string | undefined {
  return readStringList(value)[0];
}

/** Read a positive integer provider field. */
export function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Read a plain description or the `value` member of a description object. */
export function readDescription(value: unknown): string | undefined {
  const direct = readString(value);
  if (direct !== undefined) return direct;
  const object = asRecord(value);
  return readString(object?.['value']);
}

/** Read a publication date in the contract's accepted precisions. */
export function readPublishedDate(value: unknown): string | undefined {
  const date = readString(value);
  return date !== undefined && PUBLISHED_DATE_PATTERN.test(date) ? date : undefined;
}

/** Convert unmapped scalar and flat-array provider fields into attributes. */
export function attributesFromRecord(
  record: Record<string, unknown>,
  dropKeys: ReadonlySet<string>
): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (dropKeys.has(key)) continue;
    const attribute = scalarAttribute(value);
    if (attribute !== undefined) attributes[key] = attribute;
  }
  return attributes;
}

function scalarAttribute(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => scalarAttributeValue(item))) return undefined;
  const items = value.map((item) => String(item));
  return items.length === 0 ? undefined : items.join(', ');
}

function scalarAttributeValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
