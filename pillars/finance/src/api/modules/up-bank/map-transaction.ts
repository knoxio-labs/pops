/**
 * Up transaction → `ParsedTransaction` (POPS-30).
 *
 * Identity is the Up transaction id, not the canonical field key every file
 * importer hashes: a held card charge settles days later with, sometimes, a
 * different amount (a fuel pre-authorisation) and always a different
 * timestamp, and the same row must be found again when it does. The checksum
 * is therefore `sha256("up:<accountId>:<upId>")` — stable across hold →
 * settle, scoped to the POPS account like every other checksum, and opaque to
 * the recompute migrations, which only rewrite rows whose `raw_row` they can
 * read as a file row.
 *
 * Amounts arrive ledger-signed already (negative is money out) in AUD minor
 * units, and timestamps carry the customer's own UTC offset, so the calendar
 * date is the first ten characters of the stamp as Up wrote it.
 */
import { createHash } from 'node:crypto';

import { centsToDollars } from '../../../money.js';

import type { TransactionType } from '../../../contract/corrections-constants.js';
import type { ParsedTransaction } from '../../../contract/rest-imports-schemas.js';
import type { UpTransaction } from './up-api.js';

/** Bumped when the mapping below changes what it writes for the same input. */
export const UP_MAPPER_VERSION = '1';

export const UP_SOURCE_REF = 'up';

/** Stable identity for an Up row on a POPS account. */
export function upChecksum(accountId: string, upTransactionId: string): string {
  return createHash('sha256').update(`up:${accountId}:${upTransactionId}`).digest('hex');
}

/** `YYYY-MM-DD` in the offset Up stamped, which is the customer's own. */
export function upLocalDate(stamp: string): string {
  return stamp.slice(0, 10);
}

/**
 * What an unattended import may assert about a row's type.
 *
 * A transfer between the customer's own Up accounts is named as such by the
 * API. A debit is left untyped so the classification ladder treats it like any
 * other purchase. A credit must carry a type, since the commit refuses to book
 * an untyped credit (POPS-2754): a refund or reversal says so in Up's own
 * label, and every other credit is income until someone says otherwise.
 */
export function classifyUpTransaction(txn: UpTransaction): TransactionType | undefined {
  if (txn.relationships.transferAccount.data !== null) return 'transfer';
  const cents = txn.attributes.amount.valueInBaseUnits;
  if (cents < 0) return undefined;
  const label = txn.attributes.transactionType ?? '';
  if (/reversal/i.test(label)) return 'reversal';
  if (/refund/i.test(label)) return 'refund';
  return 'income';
}

/** What the row's `raw_row` keeps of the API resource, for reparse and for the settle check. */
export interface UpRawRow {
  source: 'up';
  id: string;
  status: UpTransaction['attributes']['status'];
  rawText: string | null;
  message: string | null;
  createdAt: string;
  settledAt: string | null;
  transactionType: string | null;
  category: string | null;
  parentCategory: string | null;
  cardPurchaseMethod: string | null;
}

export function upRawRow(txn: UpTransaction): UpRawRow {
  return {
    source: 'up',
    id: txn.id,
    status: txn.attributes.status,
    rawText: txn.attributes.rawText,
    message: txn.attributes.message,
    createdAt: txn.attributes.createdAt,
    settledAt: txn.attributes.settledAt,
    transactionType: txn.attributes.transactionType,
    category: txn.relationships.category.data?.id ?? null,
    parentCategory: txn.relationships.parentCategory.data?.id ?? null,
    cardPurchaseMethod: txn.attributes.cardPurchaseMethod?.method ?? null,
  };
}

export interface UpMappingTarget {
  /** The POPS `accounts.id` the config maps this Up account onto. */
  accountId: string;
  /** The POPS account's name, stamped as the row's `account` label. */
  accountLabel: string;
}

/** A parsed row plus the type the mapper could assert for it. */
export interface MappedUpTransaction {
  parsed: ParsedTransaction;
  transactionType: TransactionType | undefined;
}

export function toParsedTransaction(
  txn: UpTransaction,
  target: UpMappingTarget
): MappedUpTransaction {
  const { attributes } = txn;
  const foreign = attributes.foreignAmount;
  const parsed: ParsedTransaction = {
    date: upLocalDate(attributes.settledAt ?? attributes.createdAt),
    description: attributes.description,
    amount: centsToDollars(attributes.amount.valueInBaseUnits),
    dialectAccountLabel: target.accountLabel,
    accountId: target.accountId,
    fxCaptureSource: 'up-api',
    ...(foreign !== null
      ? {
          foreignAmountMinor: Math.abs(foreign.valueInBaseUnits),
          foreignCurrency: foreign.currencyCode,
        }
      : {}),
    pending: attributes.status === 'HELD',
    rawRow: JSON.stringify(upRawRow(txn)),
    checksum: upChecksum(target.accountId, txn.id),
  };
  return { parsed, transactionType: classifyUpTransaction(txn) };
}
