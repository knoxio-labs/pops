/**
 * Field-level readers for the Amazon DSAR export.
 *
 * Each of these exists because the real bundle does something a naive
 * `Number(x)` or `new Date(x)` gets wrong. They are separated from the
 * row-grouping logic in `order-history.ts` so the traps can be tested
 * directly against the values that produced them.
 */
import { isWellFormedSku } from '../../contract/constants.js';

import type { CreateItemInput } from '../../db/services/purchase-input.js';

/**
 * Amazon never writes an empty cell. Every absent value in the 943-row
 * bundle is one of these two strings, so a parser that checks for `''`
 * finds nothing and happily parses the sentinel as a product name.
 */
const SENTINELS = new Set(['Not Available', 'Not Applicable']);

/**
 * Two timestamps joined by this literal appear in `Ship Date` where an item
 * shipped in two parts, alongside a matching `Shipment Status` of
 * `"Shipped and Shipped"`. It is a string-concatenation bug in Amazon's own
 * export rather than a format we are meant to support.
 */
const CONCATENATED_VALUE_SEPARATOR = ' and ';

/** Read a cell as text, folding Amazon's absence sentinels to null. */
export function readText(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '' || SENTINELS.has(trimmed)) return null;
  return trimmed;
}

/**
 * Read a money cell as integer cents.
 *
 * `Total Discounts` arrives with its value wrapped in literal apostrophes
 * (`'-1.6'`) on 157 of 943 rows — Excel's "keep this as text" convention,
 * which survives into the CSV as part of the field. Stripping them is not
 * cosmetic: `Number("'-1.6'")` is `NaN`, so every discounted order would
 * lose its discount silently.
 *
 * Parsing goes through the digits rather than `Number`, because binary
 * floating point cannot hold most decimal cent values exactly and the
 * reconciliation ladder's subset-sum stage is only correct over integers.
 */
export function readCents(raw: string | undefined): number | null {
  const text = readText(raw);
  if (text === null) return null;

  const unquoted = text.replace(/^'+|'+$/gu, '').trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(stripThousandsSeparators(unquoted));
  if (match === null) return null;

  const [, sign, whole, fraction = ''] = match;
  const digits = `${fraction}000`.slice(0, 3);
  const rounded = Number(digits.slice(0, 2)) + (Number(digits.slice(2, 3)) >= 5 ? 1 : 0);
  const magnitude = Number(whole) * 100 + rounded;
  if (!Number.isSafeInteger(magnitude)) return null;

  return sign === '-' ? -magnitude : magnitude;
}

/**
 * Remove thousands separators, but only from the strict grouped form
 * (`1,495`, `1,234,567.89`).
 *
 * One row of the reference bundle — a BRL order — states `'1,495'`, and a
 * parser that rejects it drops the line and its money without a trace.
 * Stripping every comma unconditionally is the tempting fix and the wrong
 * one: in a decimal-comma locale `1,49` means one dollar forty-nine, and
 * silently reading it as 149 dollars is a hundredfold error in the
 * merchant's favour. Anything that is not unambiguously digit-grouped is
 * left alone and fails to parse, which the caller reports.
 */
function stripThousandsSeparators(value: string): string {
  if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/u.test(value)) return value;
  return value.replaceAll(',', '');
}

/**
 * Read a timestamp cell, normalised to an ISO-8601 instant.
 *
 * Where the cell holds two concatenated timestamps the first is taken and
 * the caller is told, via {@link readTimestampWithAnomaly}. Returning null
 * instead would drop the ship date of a real delivery; throwing would
 * abort a 943-row ingest over two rows of upstream sloppiness.
 */
export function readTimestamp(raw: string | undefined): string | null {
  return readTimestampWithAnomaly(raw).value;
}

/** {@link readTimestamp}, reporting whether the cell held concatenated values. */
export function readTimestampWithAnomaly(raw: string | undefined): {
  value: string | null;
  concatenated: boolean;
} {
  const text = readText(raw);
  if (text === null) return { value: null, concatenated: false };

  const concatenated = text.includes(CONCATENATED_VALUE_SEPARATOR);
  const first = text.split(CONCATENATED_VALUE_SEPARATOR)[0]?.trim() ?? text;

  const parsed = new Date(first);
  if (Number.isNaN(parsed.getTime())) return { value: null, concatenated };

  return { value: parsed.toISOString(), concatenated };
}

/**
 * Read `Original Quantity`.
 *
 * Zero is a real value on 27 rows — cancelled shipments, which keep their
 * product name and sometimes a non-zero total. It is returned as-is rather
 * than coerced to 1, so the caller can decide; the contract's minimum of 1
 * means those lines cannot be sent as-is.
 */
export function readQuantity(raw: string | undefined): number | null {
  const text = readText(raw);
  if (text === null) return null;
  if (!/^\d+$/u.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * What the export's `ASIN` column can honestly be said to be.
 *
 * Almost always an ASIN. When the column holds something that cannot be one
 * — a blank the reader kept, a marketplace id from a row shape Amazon
 * changed — the line still names a product to the merchant that printed it,
 * so it takes the weakest true claim rather than failing the order or
 * asserting a cross-source identity the string cannot support.
 *
 * Shared by the physical and digital exports, which carry the same column
 * and have no reason to read it differently.
 */
export function readProductIdentity(raw: string | undefined): CreateItemInput['sku'] {
  const asin = readText(raw);
  if (asin === null) return null;
  if (isWellFormedSku('asin', asin)) return { value: asin, scheme: 'asin' };
  return isWellFormedSku('merchant', asin) ? { value: asin, scheme: 'merchant' } : null;
}

/**
 * Split `Carrier Name & Tracking Number`, which packs both into one cell as
 * `<carrier>(<tracking>)`. Either half can be absent.
 */
export function readCarrierAndTracking(raw: string | undefined): {
  carrier: string | null;
  trackingNumber: string | null;
} {
  const text = readText(raw);
  if (text === null) return { carrier: null, trackingNumber: null };

  const match = /^(.*?)\s*\(([^()]*)\)\s*$/u.exec(text);
  if (match === null) return { carrier: text, trackingNumber: null };

  return {
    carrier: readText(match[1]),
    trackingNumber: readText(match[2]),
  };
}
