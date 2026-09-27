import type { FormFieldDef, FormFieldKind, ReferenceChoice } from './field-model';

const SHORT_TEXT_LIMIT = 200;
const LONG_TEXT_LIMIT = 20_000;
const DECIMAL_DIGITS = 18;
const DECIMAL_PLACES = 9;
const INTEGER_LIMIT = 9_007_199_254_740_991n;

const INTEGER = /^[+-]?\d+$/u;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z)?$/u;
const REFERENCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function lengthError(label: string, value: string, limit: number): string | null {
  if (value.length <= limit) return null;
  return `${label} allows up to ${limit.toLocaleString('en-AU')} characters.`;
}

function integerError(label: string, value: string): string | null {
  if (!INTEGER.test(value)) return `${label} needs a whole number.`;
  const number = BigInt(value);
  const magnitude = number < 0n ? -number : number;
  return magnitude <= INTEGER_LIMIT ? null : `${label} is too large to store.`;
}

function decimalError(label: string, value: string): string | null {
  if (!DECIMAL.test(value)) return `${label} needs a number, like 12.50.`;
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const [whole = '', fraction = ''] = unsigned.split('.');
  const significantDigits = `${whole}${fraction}`.replace(/^0+/u, '').length;
  if (fraction.length > DECIMAL_PLACES) return `${label} allows up to 9 decimal places.`;
  if (significantDigits > DECIMAL_DIGITS) return `${label} allows up to 18 digits.`;
  return null;
}

function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function dateTimeError(label: string, value: string): string | null {
  const match = DATE_TIME.exec(value);
  return match !== null && isCalendarDate(match[1] ?? '')
    ? null
    : `${label} needs a date and a time.`;
}

function urlError(label: string, value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== ''
      ? null
      : `${label} needs a full address starting with https://.`;
  } catch {
    return `${label} needs a full address starting with https://.`;
  }
}

function enumError(field: FormFieldDef, value: string): string | null {
  return field.enumOptions.some((option) => option.id === value)
    ? null
    : `${field.label} has no option ${value}.`;
}

function referenceKindError(field: FormFieldDef, value: ReferenceChoice): string | null {
  if (!field.referenceKinds.includes(value.kind)) {
    return `${field.label} does not allow ${value.kind === 'item' ? 'items' : 'places'}.`;
  }
  if (
    value.kind === 'item' &&
    value.typeId !== undefined &&
    value.typeId !== null &&
    field.referenceTypeIds.length > 0 &&
    !field.referenceTypeIds.includes(value.typeId)
  ) {
    return `${field.label} does not allow this item type.`;
  }
  return null;
}

function measurementError(field: FormFieldDef, value: string): string | null {
  const numberError = decimalError(field.label, value);
  if (numberError !== null) return numberError;
  return field.fixedUnit === null ? `${field.label} has no fixed unit.` : null;
}

type ValueError = (field: FormFieldDef, value: string) => string | null;

const valueErrors: Readonly<Record<FormFieldKind, ValueError>> = {
  short_text: (field, value) => lengthError(field.label, value, SHORT_TEXT_LIMIT),
  long_text: (field, value) => lengthError(field.label, value, LONG_TEXT_LIMIT),
  integer: (field, value) => integerError(field.label, value),
  decimal: (field, value) => decimalError(field.label, value),
  boolean: (field, value) =>
    value === 'true' || value === 'false' ? null : `${field.label} needs 'true' or 'false'.`,
  enum: (field, value) => enumError(field, value),
  measurement: measurementError,
  date: (field, value) => (isCalendarDate(value) ? null : `${field.label} needs a real date.`),
  date_time: (field, value) => dateTimeError(field.label, value),
  url: (field, value) => urlError(field.label, value),
  reference: (field, value) =>
    REFERENCE_ID.test(value) ? null : `${field.label} needs a valid reference.`,
};

function atomErrorForValue(field: FormFieldDef, value: string): string | null {
  return valueErrors[field.kind](field, value);
}

/** Returns the error for one typed text value, or null when the value is valid or empty. */
export function atomError(field: FormFieldDef, raw: string): string | null {
  const value = field.kind === 'long_text' ? raw : raw.trim();
  return value === '' ? null : atomErrorForValue(field, value);
}

/** Returns the first invalid value error for a field, or null when its draft values are valid. */
export function fieldError(field: FormFieldDef, values: readonly string[]): string | null {
  const nonEmpty = values.filter((value) => value.trim() !== '');
  if (field.cardinality === 'one' && nonEmpty.length > 1) {
    return `${field.label} holds one value.`;
  }
  for (const value of values) {
    const error = atomError(field, value);
    if (error !== null) return error;
  }
  return null;
}

/** Returns the first invalid selected reference error, or null when all references fit the field. */
export function referenceError(
  field: FormFieldDef,
  values: readonly ReferenceChoice[]
): string | null {
  if (field.cardinality === 'one' && values.length > 1) return `${field.label} holds one value.`;
  for (const value of values) {
    const error = referenceKindError(field, value);
    if (error !== null) return error;
  }
  return null;
}
