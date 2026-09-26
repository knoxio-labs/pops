/** Stable error code for invalid lookup path values. */
export const INVALID_CODE = 'barcode.lookup.invalid_code' as const;

/** The route a validated code can take inside the v1 books-only service. */
export type NormalisedCodeKind = 'book' | 'unsupported';

/** A validated code and whether it is eligible for the v1 book sources. */
export interface NormalisedCode {
  readonly code: string;
  readonly kind: NormalisedCodeKind;
}

/** Error raised when a supplied barcode cannot pass the ADR-055 rules. */
export class InvalidBarcodeError extends Error {
  readonly code = INVALID_CODE;

  constructor() {
    super('The supplied barcode is invalid.');
    this.name = 'InvalidBarcodeError';
  }
}

function checkDigitValue(char: string): number {
  return char === 'X' ? 10 : Number(char);
}

function hasValidIsbn10CheckDigit(code: string): boolean {
  let sum = 0;
  for (let index = 0; index < code.length; index += 1) {
    sum += checkDigitValue(code.charAt(index)) * (10 - index);
  }
  return sum % 11 === 0;
}

function mod10Weight(index: number, firstWeight: 1 | 3): 1 | 3 {
  if (index % 2 === 0) return firstWeight;
  return firstWeight === 3 ? 1 : 3;
}

function hasValidMod10CheckDigit(code: string): boolean {
  const checkDigit = Number(code.at(-1));
  let sum = 0;
  const firstWeight = code.length === 13 ? 1 : 3;
  for (let index = 0; index < code.length - 1; index += 1) {
    sum += Number(code.charAt(index)) * mod10Weight(index, firstWeight);
  }
  return (sum + checkDigit) % 10 === 0;
}

function isbn10To13(code: string): string {
  const body = `978${code.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < body.length; index += 1) {
    sum += Number(body.charAt(index)) * (index % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${body}${checkDigit}`;
}

function validateCode(input: string): string {
  if (typeof input !== 'string') throw new InvalidBarcodeError();

  const code = input.replace(/[\s-]/gu, '').toUpperCase();
  const validLength =
    code.length === 8 || code.length === 10 || code.length === 12 || code.length === 13;
  if (!validLength) throw new InvalidBarcodeError();
  if (!/^\d+(?:X)?$/u.test(code)) throw new InvalidBarcodeError();
  if (code.includes('X') && (code.length !== 10 || code.at(-1) !== 'X')) {
    throw new InvalidBarcodeError();
  }

  const validCheckDigit =
    code.length === 10 ? hasValidIsbn10CheckDigit(code) : hasValidMod10CheckDigit(code);
  if (!validCheckDigit) throw new InvalidBarcodeError();
  return code;
}

function isBookCode(code: string): boolean {
  return code.length === 13 && (code.startsWith('978') || code.startsWith('979'));
}

/**
 * Strip presentation separators, validate the check digit, and classify a
 * code for the books-only lookup route.
 *
 * ISBN-10 values are returned as ISBN-13 values. Valid non-book EAN/UPC
 * values remain valid but are classified as `unsupported`, allowing callers
 * to return `not_found` without invoking a book source.
 */
export function normaliseBarcode(input: string): NormalisedCode {
  const code = validateCode(input);

  if (code.length === 10) {
    return { code: isbn10To13(code), kind: 'book' };
  }

  return {
    code,
    kind: isBookCode(code) ? 'book' : 'unsupported',
  };
}

/** Alias using the shorter name used by lookup callers. */
export function normaliseCode(input: string): NormalisedCode {
  return normaliseBarcode(input);
}
