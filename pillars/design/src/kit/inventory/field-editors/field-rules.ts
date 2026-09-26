import type { CatalogueFieldKind } from '@/fixtures/inventory-type-fields';

/**
 * The value rules the API enforces on each primitive kind (the type
 * editor's primitive contract), checked as the person types so the form
 * says what is wrong before Save does. None of these is configurable per
 * field.
 */
import type { FormFieldDef, ReferenceTargets } from './field-model';

const SHORT_TEXT_LIMIT = 200;
const LONG_TEXT_LIMIT = 20_000;
const DECIMAL_DIGITS = 18;
const DECIMAL_PLACES = 9;
const INTEGER_LIMIT = 9_007_199_254_740_991n;

const INTEGER = /^[+-]?\d+$/u;
const DECIMAL = /^[+-]?(\d+)(?:\.(\d+))?$/u;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?Z?$/u;

function lengthError(label: string, text: string, limit: number): string | null {
  if (text.length <= limit) return null;
  return `${label} allows up to ${limit.toLocaleString('en-AU')} characters. This is ${text.length.toLocaleString('en-AU')}.`;
}

function integerError(label: string, text: string): string | null {
  if (!INTEGER.test(text)) return `${label} needs a whole number.`;
  const value = BigInt(text);
  const magnitude = value < 0n ? -value : value;
  return magnitude > INTEGER_LIMIT ? `${label} is too large to store.` : null;
}

function decimalError(label: string, text: string): string | null {
  const match = DECIMAL.exec(text);
  if (match === null) return `${label} needs a number, like 12.50.`;
  const whole = (match[1] ?? '').replace(/^0+(?=\d)/u, '');
  const places = match[2] ?? '';
  if (places.length > DECIMAL_PLACES) return `${label} allows up to 9 decimal places.`;
  if (whole.length + places.length > DECIMAL_DIGITS) return `${label} allows up to 18 digits.`;
  return null;
}

function isCalendarDate(text: string): boolean {
  const match = DATE.exec(text);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateTimeError(label: string, text: string): string | null {
  const match = DATE_TIME.exec(text);
  return match !== null && isCalendarDate(match[1] ?? '')
    ? null
    : `${label} needs a date and a time.`;
}

function urlError(label: string, text: string): string | null {
  const invalid = `${label} needs a full address starting with https://.`;
  if (!URL.canParse(text)) return invalid;
  const url = new URL(text);
  return url.protocol === 'https:' && url.hostname !== '' ? null : invalid;
}

function enumError(field: FormFieldDef, text: string): string | null {
  const option = field.options?.find((candidate) => candidate.id === text);
  if (option === undefined) return `${field.label} has no option ${text}.`;
  return null;
}

type AtomRule = (field: FormFieldDef, text: string) => string | null;

const RULES: Readonly<Record<CatalogueFieldKind, AtomRule>> = {
  short_text: (field, text) => lengthError(field.label, text, SHORT_TEXT_LIMIT),
  long_text: (field, text) => lengthError(field.label, text, LONG_TEXT_LIMIT),
  integer: (field, text) => integerError(field.label, text),
  decimal: (field, text) => decimalError(field.label, text),
  measurement: (field, text) => decimalError(field.label, text),
  boolean: (field, text) =>
    text === 'true' || text === 'false' ? null : `${field.label} is either yes or no.`,
  date: (field, text) => (isCalendarDate(text) ? null : `${field.label} needs a real date.`),
  date_time: (field, text) => dateTimeError(field.label, text),
  url: (field, text) => urlError(field.label, text),
  enum: enumError,
  reference: () => null,
};

/**
 * Why one typed value breaks its kind's rule, or null when it is fine. An
 * empty value is never an error here: absence is allowed on every field.
 */
export function atomError(field: FormFieldDef, raw: string): string | null {
  const text = field.kind === 'long_text' ? raw : raw.trim();
  return text === '' ? null : RULES[field.kind](field, text);
}

/** The first rule a field's values break, or null. A second value that breaks it says which. */
export function fieldError(field: FormFieldDef, values: readonly string[]): string | null {
  if (field.computed !== undefined && values.length === 0) return null;
  if (field.cardinality === 'one' && values.filter((value) => value.trim() !== '').length > 1) {
    return `${field.label} holds one value.`;
  }
  for (const value of values) {
    const error = atomError(field, value);
    if (error !== null) return error;
  }
  return null;
}

/** A place or item the reference picker offers, with what the refusal needs to know. */
export interface ReferenceCandidate {
  kind: 'item' | 'location';
  typeId: string | null;
}

/**
 * Why a reference field refuses a candidate, in words the picker shows on
 * the dimmed row, or null when the candidate is allowed. Item types never
 * constrain locations.
 */
export function referenceRefusal(
  targets: ReferenceTargets,
  candidate: ReferenceCandidate,
  typeLabel: (typeId: string) => string
): string | null {
  if (!targets.kinds.includes(candidate.kind)) {
    return candidate.kind === 'location' ? 'Places are not allowed here' : 'Only places';
  }
  if (candidate.kind === 'location' || targets.typeIds.length === 0) return null;
  if (candidate.typeId !== null && targets.typeIds.includes(candidate.typeId)) return null;
  return `Only ${targets.typeIds.map(typeLabel).join(' or ')} items`;
}
