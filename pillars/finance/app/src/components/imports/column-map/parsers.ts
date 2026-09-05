import type { AmountSign, BankDialect, SplitAmountColumns } from '../bank-dialect';

export function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Read a CSV amount into the ledger's convention, where money out is negative.
 *
 * Banks disagree on how they state a purchase, so the caller supplies its
 * bank's convention rather than this assuming one: `debit-positive` exports
 * (Amex) state purchases as positive amounts and are flipped, `debit-negative`
 * exports (ANZ credit card) already sign them and are taken as-is. Flipping
 * unconditionally turns every purchase on a `debit-negative` statement into
 * income and every repayment into spending.
 */
export function parseAmount(
  amountStr: string | undefined,
  sign: AmountSign = 'debit-positive'
): number | null {
  if (!amountStr) return null;
  const cleaned = amountStr.replaceAll(/[^0-9.-]/g, '');
  const amount = parseFloat(cleaned);
  if (isNaN(amount)) return null;
  return sign === 'debit-negative' ? amount : -amount;
}

function columnNamed(row: Record<string, string>, name: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  return Object.keys(row).find((key) => key.trim().toLowerCase() === wanted);
}

/** The raw text and the parsed amount a row states, however its bank lays the amount out. */
export interface RowAmount {
  raw: string | undefined;
  amount: number | null;
}

function magnitude(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const parsed = parseFloat(value.replaceAll(/[^0-9.-]/g, ''));
  return isNaN(parsed) ? null : Math.abs(parsed);
}

/**
 * Combine a split export's two columns into one ledger-signed amount: the
 * credit column as money in, the debit column as money out by magnitude. A
 * row with neither, or with a column the file does not have, has no amount.
 */
export function combineSplitAmount(
  row: Record<string, string>,
  columns: SplitAmountColumns
): RowAmount {
  const creditKey = columnNamed(row, columns.credit);
  const debitKey = columnNamed(row, columns.debit);
  if (creditKey === undefined || debitKey === undefined) return { raw: undefined, amount: null };
  const creditRaw = row[creditKey];
  const debitRaw = row[debitKey];
  const credit = magnitude(creditRaw);
  const debit = magnitude(debitRaw);
  const raw = [creditRaw, debitRaw].filter((v) => v && v.trim() !== '').join(' / ') || undefined;
  if (credit === null && debit === null) return { raw, amount: null };
  return { raw, amount: (credit ?? 0) - (debit ?? 0) };
}

/** The amount a row states, read the way its bank's dialect lays it out. */
export function readRowAmount(
  row: Record<string, string>,
  columnMap: Pick<ColumnMap, 'amount'>,
  dialect: Pick<BankDialect, 'amountSign' | 'splitAmount'>
): RowAmount {
  if (dialect.splitAmount) return combineSplitAmount(row, dialect.splitAmount);
  const raw = row[columnMap.amount];
  return { raw, amount: parseAmount(raw, dialect.amountSign) };
}

export function extractLocation(townCity: string): string | undefined {
  if (!townCity) return undefined;
  const lines = townCity.split('\n');
  const town = lines[0]?.trim();
  if (!town) return undefined;
  return town
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface ColumnMap {
  date: string;
  description: string;
  amount: string;
  location?: string;
}

export function isEmptyColumnMap(columnMap: ColumnMap): boolean {
  return !columnMap.date && !columnMap.description && !columnMap.amount && !columnMap.location;
}

/** Whether every field the dialect needs from the mapper is mapped. */
export function hasRequiredColumns(
  columnMap: ColumnMap,
  dialect: Pick<BankDialect, 'splitAmount'>
): boolean {
  return Boolean(
    columnMap.date && columnMap.description && (columnMap.amount || dialect.splitAmount)
  );
}

export function autoDetectColumns(headers: string[]): ColumnMap {
  const findMatch = (patterns: string[]): string => {
    for (const pattern of patterns) {
      const match = headers.find((h) => h.toLowerCase().includes(pattern));
      if (match) return match;
    }
    return '';
  };
  return {
    date: findMatch(['date', 'transaction date', 'posting date']),
    description: findMatch(['description', 'merchant', 'payee']),
    amount: findMatch(['amount', 'debit', 'credit', 'value']),
    location: findMatch(['town', 'city', 'town/city', 'location']) || undefined,
  };
}
