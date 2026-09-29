/** Maximum fractional display precision accepted by inventory fields. */
export const MAX_DECIMAL_PLACES = 9;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function withoutDecimalPlaces(
  presentation: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(presentation).filter(([key]) => key !== 'decimalPlaces')
  );
}

function incrementDigits(value: string): string {
  const digits = value.split('').map(Number);
  let index = digits.length - 1;
  while (index >= 0 && digits[index] === 9) {
    digits[index] = 0;
    index -= 1;
  }
  if (index < 0) return `1${digits.join('')}`;
  const digit = digits[index];
  if (digit === undefined) throw new Error('Cannot increment an empty decimal coefficient.');
  digits[index] = digit + 1;
  return digits.join('');
}

function decimalParts(
  value: string
): { readonly negative: boolean; readonly integer: string; readonly fraction: string } | null {
  const match = /^(?<sign>-?)(?<integer>\d+)(?:\.(?<fraction>\d+))?$/.exec(value);
  if (match?.groups === undefined) return null;
  const integer = match.groups.integer;
  const fraction = match.groups.fraction ?? '';
  if (integer === undefined) return null;
  return {
    negative: match.groups.sign === '-',
    integer,
    fraction,
  };
}

function roundedParts(
  parts: { readonly integer: string; readonly fraction: string },
  decimalPlaces: number
): { readonly integer: string; readonly fraction: string } {
  if (parts.fraction.length <= decimalPlaces) {
    return { integer: parts.integer, fraction: parts.fraction.padEnd(decimalPlaces, '0') };
  }
  const discarded = parts.fraction[decimalPlaces];
  const fraction = parts.fraction.slice(0, decimalPlaces);
  if (discarded === undefined || discarded < '5') return { integer: parts.integer, fraction };
  const coefficient = incrementDigits(`${parts.integer}${fraction}`);
  return {
    integer: coefficient.slice(0, -decimalPlaces || undefined) || '0',
    fraction: decimalPlaces === 0 ? '' : coefficient.slice(-decimalPlaces),
  };
}

function signedDecimal(negative: boolean, value: string): string {
  return negative && value !== '0' && !/^0\.0+$/.test(value) ? `-${value}` : value;
}

/** Returns whether a field kind can use a fractional display precision. */
export function supportsDecimalPlaces(kind: string): boolean {
  return kind === 'decimal' || kind === 'measurement';
}

/** Reads a valid display precision from a field presentation object. */
export function decimalPlacesFromPresentation(presentation: unknown): number | null {
  if (!isRecord(presentation)) return null;
  const value = presentation.decimalPlaces;
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_DECIMAL_PLACES
    ? value
    : null;
}

/** Returns the editor text for a field presentation's display precision. */
export function decimalPlacesInput(presentation: unknown): string {
  const value = decimalPlacesFromPresentation(presentation);
  return value === null ? '' : String(value);
}

/** Validates the optional decimal-place input accepted by the field editor. */
export function decimalPlacesInputIsValid(input: string): boolean {
  const value = input.trim();
  if (value === '') return true;
  if (!/^\d+$/.test(value)) return false;
  const places = Number(value);
  return Number.isSafeInteger(places) && places <= MAX_DECIMAL_PLACES;
}

/** Converts valid field-editor text into a stored display precision. */
export function decimalPlacesFromInput(input: string): number | null {
  const value = input.trim();
  if (value === '' || !decimalPlacesInputIsValid(value)) return null;
  return Number(value);
}

/** Adds or removes the fixed display precision without changing other hints. */
export function presentationWithDecimalPlaces(
  presentation: Readonly<Record<string, unknown>>,
  decimalPlaces: number | null
): Record<string, unknown> {
  const base = withoutDecimalPlaces(presentation);
  return decimalPlaces === null ? base : { ...base, decimalPlaces };
}

/** Formats an exact decimal string to a fixed number of display places. */
export function formatDecimal(value: string | number, decimalPlaces: number | null): string {
  if (decimalPlaces === null) return String(value);
  const parts = decimalParts(String(value));
  if (parts === null) return String(value);
  const rounded = roundedParts(parts, decimalPlaces);
  const result =
    rounded.fraction === '' ? rounded.integer : `${rounded.integer}.${rounded.fraction}`;
  return signedDecimal(parts.negative, result);
}
