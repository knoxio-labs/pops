import { parseAmexRow, parseAnzDescription } from '@pops/finance';

import type { AnzForeignCharge, FxCaptureSource } from '@pops/finance';

import type { BankDialectId } from '../../store/import-store-types';

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

/**
 * The day/month order a bank's export prints, since both are Australian
 * conventions and neither can be inferred from the string alone: `31/07/2026`
 * and `07/31/2026` are each unambiguous only if the reader already knows which
 * side is the day.
 */
export type DateOrder = 'DMY' | 'MDY';

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

/**
 * An export that states money in and money out in two columns instead of one
 * signed amount. The debit side is read by magnitude, because a bank that
 * splits the columns has already said which way the money went and may or
 * may not also sign it.
 */
export interface SplitAmountColumns {
  credit: string;
  debit: string;
}

export interface BankDialect {
  /** False when the export has no header row and {@link BankDialect.columns} names them instead. */
  hasHeader: boolean;
  /** Synthetic column names, in file order. Required when `hasHeader` is false. */
  columns?: readonly string[];
  amountSign: AmountSign;
  /**
   * Every dialect states its own day/month order rather than inheriting a
   * default, so a bank whose export prints the American order is a declared
   * fact instead of a silent transposition of every date where both sides
   * read as valid days.
   */
  dateOrder: DateOrder;
  /**
   * Set when the export splits the amount across two columns (ING). The
   * mapper then offers no Amount field: the two columns are found by name
   * and combined per row instead.
   */
  splitAmount?: SplitAmountColumns;
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

/** The shared CSV layout exported by ANZ transaction and credit-card accounts. */
const ANZ_HEADERLESS: Pick<BankDialect, 'hasHeader' | 'columns' | 'amountSign' | 'dateOrder'> = {
  hasHeader: false,
  columns: HEADERLESS_ANZ_COLUMNS,
  amountSign: 'debit-negative',
  dateOrder: 'DMY',
};

/** ANZ's credit-card descriptions additionally carry fixed-width merchant and FX details. */
const ANZ_CREDIT_CARD: BankDialect = {
  ...ANZ_HEADERLESS,
  deriveFields: parseAnzDescription,
  fxCaptureSource: 'anz-descriptor',
};

/** ANZ transaction-account exports use the shared signed, headerless CSV layout. */
const ANZ: BankDialect = {
  ...ANZ_HEADERLESS,
  fxCaptureSource: 'unavailable',
};

/**
 * A plain export whose columns hold each field separately. Nothing in it names
 * a country or a foreign amount, which is what `unavailable` states.
 */
const DEFAULT_DIALECT: BankDialect = {
  hasHeader: true,
  amountSign: 'debit-positive',
  dateOrder: 'DMY',
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
  dateOrder: 'DMY',
  deriveFields: (description, row) => ({ description, ...parseAmexRow(row) }),
  fxCaptureSource: 'unavailable',
};

/**
 * ING ships a header row with the amount split into `Credit` and `Debit`
 * columns (POPS-29). Money out is whatever the Debit column holds, by
 * magnitude, so the sign convention is not a property this dialect needs.
 */
const ING: BankDialect = {
  hasHeader: true,
  amountSign: 'debit-negative',
  dateOrder: 'DMY',
  splitAmount: { credit: 'Credit', debit: 'Debit' },
  fxCaptureSource: 'unavailable',
};

const DIALECTS: Readonly<Record<BankDialectId, BankDialect>> = {
  ANZ,
  'ANZ Credit Card': ANZ_CREDIT_CARD,
  Amex: AMEX,
  ING,
  Up: DEFAULT_DIALECT,
};

export function bankDialect(bank: BankDialectId): BankDialect {
  return DIALECTS[bank];
}
