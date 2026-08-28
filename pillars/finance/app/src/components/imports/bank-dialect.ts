import { parseAmexRow, parseAnzDescription } from '@pops/finance';

import type { AnzForeignCharge, FxCaptureSource } from '@pops/finance';

import type { BankType } from '../../store/import-store-types';

/**
 * Per-bank CSV shape, for the parts of an export that the column mapper cannot
 * express.
 *
 * Mapping columns to fields only works once the file has columns and once an
 * amount means the same thing everywhere. Neither is true across banks: ANZ
 * exports no header row at all, and banks disagree on whether a purchase is the
 * negative or the positive number. Both are properties of the format rather
 * than choices a user should be asked to make, so they are declared here and
 * the wizard reads them from the selected bank.
 */

/** Column names given to a headerless export so the rest of the wizard is unchanged. */
export const HEADERLESS_ANZ_COLUMNS = [
  'Date',
  'Amount',
  'Description',
  'Column 4',
  'Column 5',
  'Column 6',
  'Column 7',
  'Column 8',
] as const;

/**
 * How a bank signs a purchase.
 *
 * `debit-negative` — the export already signs money out as negative and needs
 * no adjustment. `debit-positive` — the export states purchases as positive
 * amounts, so the sign is flipped to reach the ledger's convention.
 */
export type AmountSign = 'debit-negative' | 'debit-positive';

/** Extra fields a bank's parser can recover from a row the columns cannot describe. */
export interface DerivedFields {
  description: string;
  location?: string;
  country?: string;
  /** Set only for an overseas charge the bank's parser could scale to minor units. */
  foreignCharge?: AnzForeignCharge;
  /**
   * Overrides the dialect's {@link BankDialect.fxCaptureSource} for this row,
   * for a bank whose exports differ in what they carry (POPS-2647).
   */
  fxCaptureSource?: FxCaptureSource;
}

export interface BankDialect {
  /** False when the export has no header row and {@link BankDialect.columns} names them instead. */
  hasHeader: boolean;
  /** Synthetic column names, in file order. Required when `hasHeader` is false. */
  columns?: readonly string[];
  amountSign: AmountSign;
  /**
   * Bank-specific parse of a row into stored fields. Absent when the export's
   * columns already hold each field separately and the mapper can reach them.
   *
   * Takes the whole row, not just the mapped description, because the two banks
   * that need it hide the same fields in different places: ANZ packs them into
   * the description string, Amex puts them in columns the mapper does not offer.
   */
  deriveFields?: (description: string, row: Record<string, string>) => DerivedFields;
  /**
   * What this bank's export can say about a foreign charge (POPS-2647). Every
   * dialect declares one, including `unavailable`, so a stored row records that
   * capture ran and found nothing rather than leaving a reader unable to tell
   * that from never having looked. A parser may narrow it per row.
   */
  fxCaptureSource: FxCaptureSource;
}

/**
 * ANZ ships a headerless, CRLF file of eight columns — date, amount,
 * description, then five it never populates — signs purchases negative, and
 * crams merchant, suburb and any foreign-currency detail into the one
 * description column.
 */
const ANZ_CREDIT_CARD: BankDialect = {
  hasHeader: false,
  columns: HEADERLESS_ANZ_COLUMNS,
  amountSign: 'debit-negative',
  deriveFields: parseAnzDescription,
  fxCaptureSource: 'anz-descriptor',
};

/**
 * A plain export whose columns hold each field separately. Nothing in it names
 * a country or a foreign amount, which is what `unavailable` states.
 */
const DEFAULT_DIALECT: BankDialect = {
  hasHeader: true,
  amountSign: 'debit-positive',
  fxCaptureSource: 'unavailable',
};

/**
 * Amex ships a header row and signs purchases positive like the default, but
 * its long export carries the merchant country and the foreign-charge detail in
 * columns the mapper does not offer — so those are read from the row here. Its
 * short export has none of those columns, so the parser narrows the row to
 * `unavailable`: nothing to read is not the same statement as nothing to find.
 */
const AMEX: BankDialect = {
  hasHeader: true,
  amountSign: 'debit-positive',
  deriveFields: (description, row) => ({ description, ...parseAmexRow(row) }),
  fxCaptureSource: 'unavailable',
};

const DIALECTS: Readonly<Record<BankType, BankDialect>> = {
  ANZ: DEFAULT_DIALECT,
  'ANZ Credit Card': ANZ_CREDIT_CARD,
  Amex: AMEX,
  ING: DEFAULT_DIALECT,
  Up: DEFAULT_DIALECT,
};

export function bankDialect(bank: BankType): BankDialect {
  return DIALECTS[bank];
}
