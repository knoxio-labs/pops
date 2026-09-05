import crypto from 'crypto-js';

import { buildImportDedupKey, extractReferenceValue } from '@pops/finance';

import { bankDialect, type BankDialect } from '../bank-dialect';
import {
  extractLocation,
  hasRequiredColumns,
  parseDate,
  readRowAmount,
  type ColumnMap,
} from './parsers';

import type { AnzForeignCharge, FxCaptureSource, ParsedTransaction } from '@pops/finance';

import type { BankDialectId } from '../../../store/import-store-types';

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
  foreignCharge?: AnzForeignCharge;
  /** What the bank's export could say about a foreign charge on this row (POPS-2647). */
  fxCaptureSource: FxCaptureSource;
}

/**
 * Resolve the stored description and its companion fields.
 *
 * A bank whose export splits merchant from location across mappable columns
 * needs nothing beyond them. A bank that hides fields the mapper cannot reach
 * declares a `deriveFields` parser: ANZ packs merchant, location, country and
 * the foreign-charge detail into one description string, and Amex puts the
 * country and foreign-charge detail in columns the mapper does not offer.
 *
 * The mapped location column still applies when the parser did not produce one,
 * so declaring a parser to reach the foreign columns does not cost a bank the
 * location it was already getting from its own column.
 */
function describeRow(
  row: Record<string, string>,
  columnMap: ColumnMap,
  dialect: BankDialect
): DescriptiveFields {
  const raw = row[columnMap.description] ?? '';
  const mapped = columnMap.location ? row[columnMap.location] : undefined;
  const location = mapped ? extractLocation(mapped) : undefined;
  const derived = dialect.deriveFields?.(raw, row);
  if (derived) {
    return {
      ...derived,
      location: derived.location ?? location,
      fxCaptureSource: derived.fxCaptureSource ?? dialect.fxCaptureSource,
    };
  }
  return { description: raw, location, fxCaptureSource: dialect.fxCaptureSource };
}

/** The wizard's account-step identity (POPS-2840/POPS-2852), bundled to keep `validateRow` under `max-params`. */
interface AccountIdentity {
  /** The dialect picked on step 1 — selects the CSV parser, not the account. */
  dialectId: BankDialectId;
  /** The real `accounts.id` picked on the same step. */
  accountId: string;
}

function validateRow(
  row: Record<string, string>,
  columnMap: ColumnMap,
  rowNum: number,
  identity: AccountIdentity
): RowValidation {
  const { dialectId, accountId } = identity;
  const dialect = bankDialect(dialectId);
  const dateStr = row[columnMap.date];
  const parsedDate = parseDate(dateStr);
  if (!parsedDate) return { error: `Row ${rowNum}: Invalid date format "${dateStr}"` };
  const { raw: amountStr, amount: parsedAmount } = readRowAmount(row, columnMap, dialect);
  if (parsedAmount === null) return { error: `Row ${rowNum}: Invalid amount "${amountStr ?? ''}"` };
  const { description, location, country, foreignCharge, fxCaptureSource } = describeRow(
    row,
    columnMap,
    dialect
  );
  const rawRow = JSON.stringify(row);
  // Keyed on the description AS EXPORTED, never the parsed one. A bank-specific
  // parse strips the detail field, and for a bank with no reference column that
  // field is the only thing separating two same-day, same-amount charges at
  // different branches of one merchant — collapsing them would silently drop a
  // real charge as a duplicate. See `import-dedup.ts`.
  //
  // Scoped to the real `accountId` (POPS-2852), not the bank dialect: two real
  // accounts sharing one dialect (two ANZ cards) must not collide.
  const dedupKey = buildImportDedupKey({
    accountId,
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
      dialectAccountLabel: dialectId,
      accountId,
      location,
      country,
      foreignAmountMinor: foreignCharge?.amountMinor,
      foreignCurrency: foreignCharge?.currency,
      fxFeeCents: foreignCharge?.feeCents,
      fxCaptureSource,
      rawRow,
      checksum: crypto.SHA256(dedupKey).toString(),
    },
  };
}

export function validateAllRows(
  rows: Record<string, string>[],
  columnMap: ColumnMap,
  dialectId: BankDialectId,
  accountId: string
): ValidationResult {
  const errors: string[] = [];
  const parsedTransactions: ParsedTransaction[] = [];
  const dialect = bankDialect(dialectId);
  if (!hasRequiredColumns(columnMap, dialect)) {
    return {
      valid: false,
      errors: [
        dialect.splitAmount
          ? 'Please map all required fields: Date, Description'
          : 'Please map all required fields: Date, Description, Amount',
      ],
      parsedTransactions,
    };
  }
  const identity: AccountIdentity = { dialectId, accountId };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const result = validateRow(row, columnMap, i + 2, identity);
    if (result.error) errors.push(result.error);
    else if (result.parsed) parsedTransactions.push(result.parsed);
  }
  return { valid: errors.length === 0, errors: errors.slice(0, 10), parsedTransactions };
}
