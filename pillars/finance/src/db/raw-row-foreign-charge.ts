/**
 * Re-derives the country and foreign-charge fields from the import row every
 * transaction still carries in `transactions.raw_row`.
 *
 * The wizard mapped four columns and stored the whole row, so the fields
 * POPS-2604 taught the importer to capture were present in the database the
 * entire time they were missing from their columns. Migration
 * `0072_backfill_foreign_charge_from_raw_row` reads them back through here.
 *
 * Nothing about either export format is re-described here. The row is routed to
 * the parser that already owns its shape — {@link parseAmexRow} for the long
 * Amex export, {@link parseAnzDescription} for ANZ's single fixed-width column,
 * whether that column arrived through the CSV wizard or inside a stored PDF
 * statement line — so a backfilled row and a freshly imported one agree by
 * construction. That is the same invariant `anz-fx-note.ts` was written to.
 *
 * Three stored shapes exist, and only these three are recognised:
 *
 *   - `{"Date":…,"Foreign Spend Amount":"5.50 USD","Commission":"0.27",…}`
 *     the long Amex export, 14 columns.
 *   - `{"Date":…,"Description":"GITHUB  INC.   GITHUB.COM  100.00  USD 5.03 AUD",
 *     "Column 4":"",…}` the headerless ANZ export, whose foreign detail is a
 *     trailer INSIDE the description rather than a column of its own.
 *   - `{"source":"anz-pdf-statement","line":…}` an ANZ PDF statement row.
 *
 * The short four-column Amex export is deliberately not a fourth shape: it
 * carries no foreign columns at all, so there is nothing to recover and its
 * rows must be left untouched rather than written zero. Absent and zero are
 * different answers.
 */
import { parseAmexRow } from '../contract/amex-row.js';
import { parseAnzDescription, type AnzForeignCharge } from '../contract/anz-description.js';
import { anzPdfStatementLineDescription } from '../contract/anz-statement-line.js';

/** Present on the long Amex export and on nothing else. */
const AMEX_FOREIGN_SPEND_COLUMN = 'Foreign Spend Amount';

/**
 * The synthetic names the headerless ANZ import gives its unlabelled columns
 * (`HEADERLESS_ANZ_COLUMNS`). ANZ never populates them — its detail lives
 * inside the description — so they identify the shape and carry nothing.
 */
const ANZ_HEADERLESS_COLUMNS = ['Column 4', 'Column 5', 'Column 6', 'Column 7', 'Column 8'];

/** `source` value the PDF importer stamps on the row it stores. */
const ANZ_PDF_SOURCE = 'anz-pdf-statement';

/**
 * A description ending in ANZ's foreign trailer: `<CCY> <fee> AUD`.
 *
 * This is the CANDIDATE test, not the parse — it decides whether a row claims
 * foreign detail, so that a claim {@link parseAnzDescription} cannot read
 * aborts the migration instead of being left NULL. It anchors on the currency
 * code and the settlement suffix and reads outward, because the field it
 * matches also holds a whitespace-padded merchant and location: splitting on
 * runs of spaces would find a trailer in a merchant name.
 */
const ANZ_FOREIGN_TRAILER_CLAIM = /\s[A-Z]{3}\s+\d[\d, .]*\s+AUD$/;

/** What one stored row still holds, and whether it holds a claim nothing could read. */
export interface RawRowForeignFields {
  /** ISO-3166-1 alpha-2, only where the row's own parser yields one. Never guessed. */
  country?: string;
  /** Set only for a row that states a complete, scalable foreign charge. */
  foreignCharge?: AnzForeignCharge;
  /**
   * The row states foreign detail that did not parse. The format drifted, or
   * the charge is in a currency with no known minor-unit scale; either way the
   * backfill must abort rather than record the row as domestic.
   */
  unreadable: boolean;
}

/** A row with nothing to recover and no failed claim to report. */
function nothing(): RawRowForeignFields {
  return { unreadable: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Every column the Amex parser reads, as strings.
 *
 * A non-string cell is dropped rather than stringified: `parseAmexRow` expects
 * the exported text, and `String(null)` would hand it the word `null`.
 */
function amexCells(row: Record<string, unknown>): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string') cells[key] = value;
  }
  return cells;
}

/**
 * A long-form Amex row.
 *
 * `Foreign Spend Amount` carrying text that {@link parseAmexRow} does not turn
 * into a charge is unreadable, including the case where the spend is stated and
 * `Commission` is not. The fee is the figure this capture exists to surface, so
 * a charge recorded as having cost nothing to convert is worse than one
 * recorded as uncaptured.
 */
function fromAmexRow(row: Record<string, unknown>): RawRowForeignFields {
  const { country, foreignCharge } = parseAmexRow(amexCells(row));
  const claimsForeign = text(row, AMEX_FOREIGN_SPEND_COLUMN).length > 0;
  return { country, foreignCharge, unreadable: claimsForeign && foreignCharge === undefined };
}

function fromAnzDescription(description: string): RawRowForeignFields {
  const { country, foreignCharge } = parseAnzDescription(description);
  const claimsForeign = ANZ_FOREIGN_TRAILER_CLAIM.test(description.replace(/\r/g, '').trimEnd());
  return { country, foreignCharge, unreadable: claimsForeign && foreignCharge === undefined };
}

function isAnzHeaderlessRow(row: Record<string, unknown>): boolean {
  return ANZ_HEADERLESS_COLUMNS.every((column) => column in row);
}

/**
 * Recover the country and foreign charge from one stored `raw_row`.
 *
 * A row of no recognised shape — the short Amex export, a dialect that never
 * existed, malformed JSON — yields nothing and is NOT unreadable: there is no
 * claim to fail on, and the migration must leave such a row alone.
 */
export function parseRawRowForeignFields(rawRow: string): RawRowForeignFields {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawRow);
  } catch {
    return nothing();
  }
  if (!isRecord(parsed)) return nothing();

  if (parsed['source'] === ANZ_PDF_SOURCE) {
    const line = typeof parsed['line'] === 'string' ? parsed['line'] : undefined;
    const description = line === undefined ? undefined : anzPdfStatementLineDescription(line);
    return description === undefined ? nothing() : fromAnzDescription(description);
  }
  if (AMEX_FOREIGN_SPEND_COLUMN in parsed) return fromAmexRow(parsed);
  if (isAnzHeaderlessRow(parsed)) {
    const description = parsed['Description'];
    return typeof description === 'string' ? fromAnzDescription(description) : nothing();
  }
  return nothing();
}

/** How each field the migration asks for is read off a parsed row. */
const FIELD_READERS: Readonly<
  Record<string, (fields: RawRowForeignFields) => string | number | null>
> = {
  amount_minor: (fields) => fields.foreignCharge?.amountMinor ?? null,
  currency: (fields) => fields.foreignCharge?.currency ?? null,
  fee_cents: (fields) => fields.foreignCharge?.feeCents ?? null,
  country: (fields) => fields.country ?? null,
  /**
   * `1`/`0` rather than NULL-or-set: the migration COUNTS these, where a NULL
   * would be indistinguishable from a row that simply carried nothing.
   */
  unreadable: (fields) => (fields.unreadable ? 1 : 0),
};

/**
 * One field of a parsed `raw_row`, as the scalar a registered SQLite function
 * must return.
 *
 * A non-string `raw_row` — NULL in the column — reads as a row carrying
 * nothing, which is also not unreadable: there is no claim to fail on.
 */
export function rawRowForeignField(rawRow: unknown, field: unknown): string | number | null {
  const read = typeof field === 'string' ? FIELD_READERS[field] : undefined;
  if (read === undefined) {
    throw new Error(`finance_raw_row_foreign: unknown field ${String(field)}`);
  }
  return read(typeof rawRow === 'string' ? parseRawRowForeignFields(rawRow) : nothing());
}
