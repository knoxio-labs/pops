/**
 * ANZ credit-card PDF statement rows → transactions, sharing every derivation
 * with the CSV importer.
 *
 * The two paths differ only in how a row is found. Once found, the description
 * goes through {@link parseAnzDescription} and the dedup identity through
 * {@link buildImportDedupKey}, exactly as `column-map/validation.ts` does, so a
 * charge imported from either source stores the same fields.
 *
 * Two things about that reuse are easy to get wrong:
 *
 * 1. **The description is passed through untouched.** `parseAnzDescription`
 *    splits on a fixed 25-character offset, so collapsing runs of whitespace
 *    first — which an earlier PDF transformer did — destroys the boundary and
 *    every suburb, country and foreign-currency figure with it.
 * 2. **The dedup key is built from the raw description, not the parsed one.**
 *    The suburb is the only thing separating two same-day, same-amount charges
 *    at different branches of one merchant, and ANZ ships no reference column
 *    (see `import-dedup.ts`). Keying on the parsed description would collapse
 *    such a pair and silently drop a real charge.
 *
 * ## Cross-source duplicates: this path withholds, it never merges
 *
 * Point 2 has a consequence across sources. A PDF does not render a description
 * byte-identically to the CSV export, so the same charge imported from both
 * produces two checksums and inserts twice. A looser cross-source key would fix
 * that and reintroduce exactly the collapse point 2 exists to prevent — the
 * two-branches-one-merchant pair is indistinguishable under any key loose
 * enough to match across sources.
 *
 * So this path does neither. {@link planAnzPdfImport} withholds every row dated
 * inside the interval the account's existing transactions already cover, and
 * itemises what it withheld. The reasoning is that an ANZ CSV export is a
 * complete record of its period, so a covered date is dense rather than
 * sampled, and a PDF row inside it is a re-import by construction. Withholding
 * per row rather than refusing the file keeps the pre-coverage part of a
 * boundary statement importable; itemising rather than counting is what makes
 * the assumption recoverable by hand if a partial CSV import ever breaks it.
 * Nothing is merged, nothing is dropped unnamed.
 */
import { parseAnzDescription } from './anz-description.js';
import { ANZ_STATEMENT_ROW } from './anz-statement-line.js';
import { buildImportDedupKey } from './import-dedup.js';

import type { ParsedTransaction } from './rest-imports-schemas.js';

/**
 * A line that opens like a transaction row. Anything matching this but not
 * {@link ANZ_STATEMENT_ROW} is a shape this parser does not model, and is reported
 * rather than skipped — a statement layout that changed must not read as a
 * statement with fewer charges on it.
 */
const ROW_PREFIX = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}\b/;

const PRINTED_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** `DD/MM/YYYY` → `YYYY-MM-DD`, or nothing when the printed date is not a real day. */
function toIsoDate(printed: string): string | undefined {
  const match = PRINTED_DATE.exec(printed);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso
    ? undefined
    : iso;
}

/** Statement figures are printed unsigned; `CR` is the only marker of money in. */
function toSignedAmount(printed: string, isCredit: boolean): number | undefined {
  const value = Number(printed.replaceAll(',', ''));
  if (!Number.isFinite(value)) return undefined;
  return isCredit ? value : -value;
}

/** What this parser recovered from one statement's extracted text. */
export interface AnzPdfStatement {
  transactions: ParsedTransaction[];
  /** Lines that open like a transaction row and did not parse. Never silent. */
  unrecognisedRows: string[];
}

export interface AnzPdfStatementOptions {
  /** Account name stored on every transaction, as the ledger names this card. */
  account: string;
  /**
   * SHA-256 of the dedup key. Injected because this module, like
   * `import-dedup.ts`, stays crypto-free so it runs unchanged in the browser
   * and in Node; both sides hash the same key to the same digest.
   */
  hashDedupKey: (key: string) => string;
}

function toTransaction(
  line: string,
  options: AnzPdfStatementOptions
): ParsedTransaction | undefined {
  const match = ANZ_STATEMENT_ROW.exec(line);
  if (!match) return undefined;
  const [, , printedDate, rawDescription = '', printedAmount = '', credit] = match;
  const date = toIsoDate(printedDate ?? '');
  const amount = toSignedAmount(printedAmount, credit !== undefined);
  if (date === undefined || amount === undefined) return undefined;

  const { description, location, country, foreignCharge } = parseAnzDescription(rawDescription);
  if (!description) return undefined;

  const dedupKey = buildImportDedupKey({
    account: options.account,
    date,
    amount,
    description: rawDescription,
  });
  return {
    date,
    description,
    amount,
    account: options.account,
    location,
    country,
    foreignAmountMinor: foreignCharge?.amountMinor,
    foreignCurrency: foreignCharge?.currency,
    fxFeeCents: foreignCharge?.feeCents,
    fxCaptureSource: 'anz-descriptor',
    rawRow: JSON.stringify({ source: 'anz-pdf-statement', line }),
    checksum: options.hashDedupKey(dedupKey),
  };
}

/**
 * Parse the text extracted from an ANZ credit-card PDF statement.
 *
 * Takes already-extracted text rather than PDF bytes so it stays pure and
 * browser-safe; byte extraction belongs to the caller.
 */
export function parseAnzPdfStatementText(
  text: string,
  options: AnzPdfStatementOptions
): AnzPdfStatement {
  const transactions: ParsedTransaction[] = [];
  const unrecognisedRows: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r/g, '').trim();
    const transaction = toTransaction(line, options);
    if (transaction) transactions.push(transaction);
    else if (ROW_PREFIX.test(line)) unrecognisedRows.push(line);
  }
  return { transactions, unrecognisedRows };
}

/** Inclusive span of dates, `YYYY-MM-DD`. */
export interface DateInterval {
  from: string;
  to: string;
}

/** Why a parsed row was not offered for import. */
export type WithheldReason = 'already-covered';

export interface WithheldTransaction {
  transaction: ParsedTransaction;
  reason: WithheldReason;
}

/** Why a whole statement yielded nothing to import. */
export type ImportRefusal = 'no-transactions-found' | 'entirely-already-covered';

export interface AnzPdfImportPlan {
  importable: ParsedTransaction[];
  /** Every withheld row, itemised. A count alone would hide which charge went missing. */
  withheld: WithheldTransaction[];
  /** Set when nothing is importable, so an empty result is a finding rather than a quiet success. */
  refusal?: ImportRefusal;
}

function isCovered(date: string, coverage: DateInterval | undefined): boolean {
  return coverage !== undefined && date >= coverage.from && date <= coverage.to;
}

/**
 * Split parsed statement rows into what may be imported and what the account
 * already covers from another source.
 *
 * `coverage` is the inclusive span of the account's existing transactions;
 * omitting it means the account has none and every row is importable.
 */
export function planAnzPdfImport(
  transactions: readonly ParsedTransaction[],
  coverage?: DateInterval
): AnzPdfImportPlan {
  const importable: ParsedTransaction[] = [];
  const withheld: WithheldTransaction[] = [];
  for (const transaction of transactions) {
    if (isCovered(transaction.date, coverage))
      withheld.push({ transaction, reason: 'already-covered' });
    else importable.push(transaction);
  }
  if (importable.length > 0) return { importable, withheld };
  return {
    importable,
    withheld,
    refusal: withheld.length > 0 ? 'entirely-already-covered' : 'no-transactions-found',
  };
}
