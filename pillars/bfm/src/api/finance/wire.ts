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
 * The money contract is finance's and is mirrored, not reinterpreted.
 * `amount` is SIGNED DECIMAL DOLLARS on finance's wire (it persists integer
 * cents and divides once at its REST edge) and stays exactly that here.
 * Converting to cents and back would be a second representation and a second
 * rounding rule, which is how two services come to disagree about what
 * somebody spent.
 */
import { z } from 'zod';

import { MOBILE_CURRENCY } from '../../contract/rest-schemas.js';

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
  amount: z.number(),
  /**
   * Date-only `YYYY-MM-DD`, enforced rather than accepted as a bare string:
   * it is half the keyset cursor, and a producer that started emitting a full
   * timestamp would silently change what "the next page" means.
   */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'expected a date-only YYYY-MM-DD value'),
  type: z.string(),
  entityName: z.string().nullable(),
  tags: z.array(z.string()),
});

export type FinanceTransactionRow = z.infer<typeof FinanceTransactionRowSchema>;

/** The fields the detail screen adds on top of a list row. */
export const FinanceTransactionDetailSchema = FinanceTransactionRowSchema.extend({
  /** FK to `accounts.id` — finance carries no denormalised account name (POPS-2770). */
  accountId: z.string(),
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

/** Finance list row → mobile list row. Field-for-field; no arithmetic. */
export function toMobileTransaction(row: FinanceTransactionRow): MobileTransaction {
  return {
    id: row.id,
    description: row.description,
    amount: row.amount,
    currency: MOBILE_CURRENCY,
    date: row.date,
    type: row.type,
    entityName: row.entityName,
    tags: row.tags,
  };
}

/**
 * Finance record → the mobile detail record.
 *
 * `accountName` is resolved by the caller via the accounts lookup (POPS-2770)
 * — finance's own response carries only `accountId`, and this mapper has no
 * way to reach finance itself.
 */
export function toMobileTransactionDetail(
  row: FinanceTransactionDetail,
  accountName: string
): MobileTransactionDetail {
  return {
    ...toMobileTransaction(row),
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
 * understand, which is worse than the row failing to decode.
 */
export const FinanceAccountBalanceSchema = z.object({
  balanceCents: z.number().int(),
  asOf: z.string(),
  basis: z.enum(['checkpoint', 'transactions']),
  inconsistent: z.boolean(),
});

export type FinanceAccountBalance = z.infer<typeof FinanceAccountBalanceSchema>;

/**
 * The subset of finance's `AccountSchema` bfm reads.
 *
 * No transaction count — finance's own wire schema carries none. `kind`
 * stays an open string for the same reason as
 * {@link FinanceTransactionRowSchema.shape.type}.
 */
export const FinanceAccountRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  currency: z.string(),
  archivedAt: z.string().nullable(),
  institutionId: z.string().nullable(),
  /**
   * Finance resolves this from contacts for a `person` account and leaves it
   * null for every other kind. bfm passes it through as `contact` without
   * reading `entityDisplayNameStale` beside it: the phone has no editing
   * surface where a stale name could be corrected, so the flag would be a
   * fact it could only display.
   */
  entityDisplayName: z.string().nullable(),
  balance: FinanceAccountBalanceSchema,
});

export type FinanceAccountRow = z.infer<typeof FinanceAccountRowSchema>;

export const FinanceAccountListResponseSchema = z.object({
  data: z.array(FinanceAccountRowSchema),
});

export const FinanceAccountGetResponseSchema = z.object({
  data: FinanceAccountRowSchema,
});

/**
 * The subset of finance's `InstitutionSchema` bfm reads (POPS-2803). The
 * brand colour and logo asset are deliberately not carried: the phone's mark
 * draws initials on a neutral surface and has nowhere to put either
 * (POPS-2923).
 */
export const FinanceInstitutionRowSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const FinanceInstitutionListResponseSchema = z.object({
  data: z.array(FinanceInstitutionRowSchema),
});

/** Finance's month-end series, as returned by `accounts/:id/balance-history`. */
export const FinanceBalanceHistoryResponseSchema = z.object({
  data: z.array(z.object({ month: z.string(), balanceCents: z.number().int() })),
});

export type FinanceBalanceHistoryResponse = z.infer<typeof FinanceBalanceHistoryResponseSchema>;

/**
 * Finance record → mobile record. `archivedAt` collapses to a plain boolean.
 *
 * `institutionName` is passed in rather than read off the row because finance
 * carries only the id: the caller holds whatever the institutions lookup
 * produced, and `null` from a failed lookup is indistinguishable here from
 * `null` for an account that has no institution. `institutionId` is on the
 * mobile record precisely so a consumer that cares can still tell them apart.
 */
export function toMobileAccount(
  row: FinanceAccountRow,
  institutionName: string | null
): MobileAccount {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    archived: row.archivedAt !== null,
    institutionId: row.institutionId,
    institutionName,
    contact: row.entityDisplayName,
    balance: {
      balanceCents: row.balance.balanceCents,
      asOf: row.balance.asOf,
      basis: row.balance.basis,
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
