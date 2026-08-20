import crypto from 'crypto-js';

import { buildImportDedupKey, extractReferenceValue } from '@pops/finance';

import { bankDialect, type BankDialect } from '../bank-dialect';
import { extractLocation, parseAmount, parseDate, type ColumnMap } from './parsers';

import type { ParsedTransaction } from '@pops/finance';

import type { BankType } from '../../../store/import-store-types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  parsedTransactions: ParsedTransaction[];
}

interface RowValidation {
  parsed?: ParsedTransaction;
  error?: string;
}

/** Fields a row contributes beyond date and amount, after any bank-specific parse. */
interface DescriptiveFields {
  description: string;
  location?: string;
  country?: string;
  notes?: string;
}

/**
 * Resolve the stored description and its companion fields.
 *
 * A bank whose export splits merchant from location across columns needs
 * nothing beyond the mapped columns. A bank that packs them into one — ANZ —
 * declares a `deriveFields` parser, which also recovers the country and the
 * foreign-currency detail that no column holds.
 */
function describeRow(
  row: Record<string, string>,
  columnMap: ColumnMap,
  dialect: BankDialect
): DescriptiveFields {
  const raw = row[columnMap.description] ?? '';
  if (dialect.deriveFields) return dialect.deriveFields(raw);
  const location = columnMap.location ? row[columnMap.location] : undefined;
  return { description: raw, location: location ? extractLocation(location) : undefined };
}

function validateRow(
  row: Record<string, string>,
  columnMap: ColumnMap,
  rowNum: number,
  account: BankType
): RowValidation {
  const dialect = bankDialect(account);
  const dateStr = row[columnMap.date];
  const parsedDate = parseDate(dateStr);
  if (!parsedDate) return { error: `Row ${rowNum}: Invalid date format "${dateStr}"` };
  const amountStr = row[columnMap.amount];
  const parsedAmount = parseAmount(amountStr, dialect.amountSign);
  if (parsedAmount === null) return { error: `Row ${rowNum}: Invalid amount "${amountStr}"` };
  const { description, location, country, notes } = describeRow(row, columnMap, dialect);
  const rawRow = JSON.stringify(row);
  // Keyed on the description AS EXPORTED, never the parsed one. A bank-specific
  // parse strips the detail field, and for a bank with no reference column that
  // field is the only thing separating two same-day, same-amount charges at
  // different branches of one merchant — collapsing them would silently drop a
  // real charge as a duplicate. See `import-dedup.ts`.
  const dedupKey = buildImportDedupKey({
    date: parsedDate,
    amount: parsedAmount,
    description: row[columnMap.description] ?? '',
    reference: extractReferenceValue(row),
  });
  return {
    parsed: {
      date: parsedDate,
      description,
      amount: parsedAmount,
      account,
      location,
      country,
      notes,
      rawRow,
      checksum: crypto.SHA256(dedupKey).toString(),
    },
  };
}

export function validateAllRows(
  rows: Record<string, string>[],
  columnMap: ColumnMap,
  account: BankType
): ValidationResult {
  const errors: string[] = [];
  const parsedTransactions: ParsedTransaction[] = [];
  if (!columnMap.date || !columnMap.description || !columnMap.amount) {
    return {
      valid: false,
      errors: ['Please map all required fields: Date, Description, Amount'],
      parsedTransactions,
    };
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const result = validateRow(row, columnMap, i + 2, account);
    if (result.error) errors.push(result.error);
    else if (result.parsed) parsedTransactions.push(result.parsed);
  }
  return { valid: errors.length === 0, errors: errors.slice(0, 10), parsedTransactions };
}
