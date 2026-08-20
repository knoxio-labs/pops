import { parseAnzDescription } from '@pops/finance';

import type { AnzForeignCharge } from '@pops/finance';

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
}

export interface BankDialect {
  /** False when the export has no header row and {@link BankDialect.columns} names them instead. */
  hasHeader: boolean;
  /** Synthetic column names, in file order. Required when `hasHeader` is false. */
  columns?: readonly string[];
  amountSign: AmountSign;
  /**
   * Bank-specific parse of the mapped description into stored fields. Absent
   * when the export's columns already hold each field separately.
   */
  deriveFields?: (description: string) => DerivedFields;
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
};

const DEFAULT_DIALECT: BankDialect = { hasHeader: true, amountSign: 'debit-positive' };

const DIALECTS: Readonly<Record<BankType, BankDialect>> = {
  ANZ: DEFAULT_DIALECT,
  'ANZ Credit Card': ANZ_CREDIT_CARD,
  Amex: DEFAULT_DIALECT,
  ING: DEFAULT_DIALECT,
  Up: DEFAULT_DIALECT,
};

export function bankDialect(bank: BankType): BankDialect {
  return DIALECTS[bank];
}
