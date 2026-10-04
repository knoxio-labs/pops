/**
 * The finance transaction shape bfm reads, and the mapping from it to the
 * mobile shape bfm publishes.
 *
 * Validated rather than trusted. `pillar<TRouter>()` is typed by the CALLER —
 * the SDK proxy resolves routes from the producer's OpenAPI at runtime — so
 * the local router type is an assertion, not a check. Money is the reason that
 * is not good enough here: a producer-side rename would arrive as `undefined`
 * and reach a phone screen as a blank or a zero, months before anyone noticed.
 *
 * Finance sends signed decimal amounts after converting its persisted minor
 * units at the REST edge. BFM converts that decimal to the account currency's
 * integer minor units once for the mobile contract, and rejects values that
 * cannot be represented exactly at that precision.
 */
import { z } from 'zod';

import { TransactionDateSchema } from '../../contract/transaction.js';

import type {
  MobileAccount,
  MobileAccountBalancePoint,
  MobileTransaction,
  MobileTransactionDetail,
} from '../../contract/rest-schemas.js';

/**
 * The subset of finance's `TransactionSchema` the list row is built from.
 *
 * `type` is left an open string deliberately. Finance's transaction type is a
 * closed vocabulary today, but pinning it here would mean finance could not
 * ADD a type without bfm rejecting every page containing one — turning a
 * routine producer change into a blank transaction list on a phone. Nothing
 * here branches on it.
 */
export const FinanceTransactionRowSchema = z.object({
  id: z.string(),
  description: z.string(),
  /** FK to `accounts.id` — a transaction's currency is its account's (POPS-3571). */
  accountId: z.string(),
  amount: z.number(),
  /**
   * Date-only `YYYY-MM-DD`, enforced rather than accepted as a bare string:
   * it is half the keyset cursor, and a producer that started emitting a full
   * timestamp would silently change what "the next page" means.
   */
  date: TransactionDateSchema,
  type: z.string(),
  entityName: z.string().nullable(),
  tags: z.array(z.string()),
});

export type FinanceTransactionRow = z.infer<typeof FinanceTransactionRowSchema>;

/** The fields the detail screen adds on top of a list row. */
export const FinanceTransactionDetailSchema = FinanceTransactionRowSchema.extend({
  entityId: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  notes: z.string().nullable(),
  relatedTransactionId: z.string().nullable(),
  lastEditedTime: z.string(),
});

export type FinanceTransactionDetail = z.infer<typeof FinanceTransactionDetailSchema>;

export const FinanceTransactionListResponseSchema = z.object({
  data: z.array(FinanceTransactionRowSchema),
});

export const FinanceTransactionGetResponseSchema = z.object({
  data: FinanceTransactionDetailSchema,
});

/**
 * Finance list row → mobile list row with an amount in currency minor units.
 *
 * `currency` is the caller's to resolve — a transaction's currency is its
 * account's (POPS-3571), and this mapper never reaches finance itself. The
 * caller passes {@link import('../../contract/transaction.js').FALLBACK_MOBILE_CURRENCY}
 * when that lookup failed,
 * never as the ordinary answer.
 *
 * Returns `null` when the decimal amount cannot be represented exactly as a
 * safe integer in the currency's minor units.
 */
export function toMobileTransaction(
  row: FinanceTransactionRow,
  currency: string
): MobileTransaction | null {
  const amountMinorUnits = toMinorUnits(row.amount, currency);
  if (amountMinorUnits === null) return null;

  return {
    id: row.id,
    description: row.description,
    amountMinorUnits,
    currency,
    date: row.date,
    type: row.type,
    entityName: row.entityName,
    tags: row.tags,
  };
}

type DecimalAmount = {
  sign: string;
  digits: string;
  decimalPlaces: number;
};

function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

function parseDecimalAmount(amount: number): DecimalAmount | null {
  const parts = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/iu.exec(amount.toString());
  if (parts === null) return null;

  const sign = parts[1];
  const whole = parts[2];
  if (sign === undefined || whole === undefined) return null;

  const fraction = parts[3] ?? '';
  const exponent = Number(parts[4] ?? 0);
  if (!Number.isSafeInteger(exponent)) return null;

  return { sign, digits: `${whole}${fraction}`, decimalPlaces: fraction.length - exponent };
}

function scaleDecimalAmount(amount: DecimalAmount, fractionDigits: number): string | null {
  const shift = fractionDigits - amount.decimalPlaces;
  if (shift >= 0) return `${amount.digits}${'0'.repeat(shift)}`;

  const discardedDigits = -shift;
  if (discardedDigits >= amount.digits.length) {
    return /[^0]/u.test(amount.digits) ? null : '0';
  }

  const retainedLength = amount.digits.length - discardedDigits;
  const discarded = amount.digits.slice(retainedLength);
  return /[^0]/u.test(discarded) ? null : amount.digits.slice(0, retainedLength);
}

function toMinorUnits(amount: number, currency: string): number | null {
  const decimalAmount = parseDecimalAmount(amount);
  if (decimalAmount === null) return null;

  const digits = scaleDecimalAmount(decimalAmount, currencyFractionDigits(currency));
  if (digits === null) return null;

  const normalizedDigits = digits.replace(/^0+/u, '') || '0';
  const minorUnits = BigInt(`${decimalAmount.sign}${normalizedDigits}`);
  if (
    minorUnits > BigInt(Number.MAX_SAFE_INTEGER) ||
    minorUnits < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return null;
  }
  return Number(minorUnits);
}

/**
 * Finance record → the mobile detail record.
 *
 * `accountName` and `currency` are resolved by the caller via the accounts
 * lookup (POPS-2770, POPS-3571) — finance's own response carries only
 * `accountId`, and this mapper has no way to reach finance itself. Returns
 * `null` when the decimal amount cannot be represented exactly as a safe
 * integer in the currency's minor units.
 */
export function toMobileTransactionDetail(
  row: FinanceTransactionDetail,
  accountName: string,
  currency: string
): MobileTransactionDetail | null {
  const transaction = toMobileTransaction(row, currency);
  if (transaction === null) return null;

  return {
    ...transaction,
    account: accountName,
    entityId: row.entityId,
    location: row.location,
    country: row.country,
    notes: row.notes,
    relatedTransactionId: row.relatedTransactionId,
    lastEditedTime: row.lastEditedTime,
  };
}

/**
 * The subset of finance's `AccountBalanceSchema` bfm reads — everything
 * except `anchor`, which names a checkpoint the phone has no use for
 * (POPS-2884). `basis` is pinned, unlike `kind` below: finance adding a third
 * basis would mean bfm is silently mislabelling a balance it does not
 * understand, which is worse than the row failing to decode. `reconciliation`
 * is also pinned so an unknown comparison state cannot be mistaken for a
 * known result.
 */
export const FinanceAccountBalanceSchema = z.object({
  balanceCents: z.number().int(),
  asOf: z.string(),
  basis: z.enum(['checkpoint', 'transactions']),
  reconciliation: z.enum(['unmeasured', 'agreed', 'disagrees']),
  inconsistent: z.boolean(),
});

export type FinanceAccountBalance = z.infer<typeof FinanceAccountBalanceSchema>;

/**
 * The subset of finance's `AccountSchema` bfm reads.
 *
 * `kind` stays an open string for the same reason as
 * {@link FinanceTransactionRowSchema.shape.type}.
 */
export const FinanceAccountRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  currency: z.string(),
  archivedAt: z.string().nullable(),
  displayOrder: z.number().int(),
  /**
   * The counterparty (`person` accounts) or issuing bank (every other kind
   * that carries one — not `cash`) — one unified concept on finance's side.
   * `entityDisplayName` resolves it in the same round trip; bfm never fetches
   * a separate id → name lookup for either case.
   */
  entityId: z.string().nullable(),
  entityDisplayName: z.string().nullable(),
  balance: FinanceAccountBalanceSchema,
  /** Every transaction on the account (POPS-2924) — finance's own literal count. */
  transactionCount: z.number().int(),
});

export type FinanceAccountRow = z.infer<typeof FinanceAccountRowSchema>;

export const FinanceAccountListResponseSchema = z.object({
  data: z.array(FinanceAccountRowSchema),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
});

export const FinanceAccountGetResponseSchema = z.object({
  data: FinanceAccountRowSchema,
});

/** Finance's month-end series, as returned by `accounts/:id/balance-history`. */
export const FinanceBalanceHistoryResponseSchema = z.object({
  data: z.array(z.object({ month: z.string(), balanceCents: z.number().int() })),
});

export type FinanceBalanceHistoryResponse = z.infer<typeof FinanceBalanceHistoryResponseSchema>;

/**
 * Finance record → mobile record. `archivedAt` collapses to a plain boolean.
 *
 * `entityId`/`entityDisplayName` cover both a person account's counterparty
 * and every other kind's issuing bank, resolved together by finance in the
 * same row — `kind` is what tells them apart here, the same discriminator
 * finance itself uses (`hasIssuingInstitution`): `person` maps to `contact`,
 * everything else maps to `institutionId`/`institutionName`.
 */
export function toMobileAccount(row: FinanceAccountRow): MobileAccount {
  const isPersonAccount = row.kind === 'person';
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    archived: row.archivedAt !== null,
    institutionId: isPersonAccount ? null : row.entityId,
    institutionName: isPersonAccount ? null : row.entityDisplayName,
    contact: isPersonAccount ? row.entityDisplayName : null,
    transactionCount: row.transactionCount,
    balance: {
      balanceCents: row.balance.balanceCents,
      asOf: row.balance.asOf,
      basis: row.balance.basis,
      reconciliation: row.balance.reconciliation,
      inconsistent: row.balance.inconsistent,
    },
  };
}

/**
 * Finance's month-end series → the mobile one. A pass-through today; it
 * exists so the phone's history shape is stated in this file alongside every
 * other wire mapping rather than being finance's shape by coincidence.
 */
export function toMobileBalancePoints(
  response: FinanceBalanceHistoryResponse
): MobileAccountBalancePoint[] {
  return response.data.map((point) => ({
    month: point.month,
    balanceCents: point.balanceCents,
  }));
}
