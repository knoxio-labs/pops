import { z } from 'zod';

/**
 * Stamped only when a transaction's own account currency could not be
 * resolved — a finance account lookup that failed or timed out, never the
 * ordinary case. Finance accounts carry a real `currency` (migration
 * `0083_accounts.sql`), and a transaction's currency is its account's, so
 * {@link import('../api/finance/wire.js').toMobileTransaction} is handed that
 * currency by its caller and reaches for this only as the last resort — see
 * `api/finance/accounts-client.ts` for the resolution.
 *
 * This used to be the currency bfm stamped on EVERY row unconditionally,
 * before bfm read the account's own currency: a BRL cash account's rows all
 * read as this value, off by roughly a factor of three (POPS-3571).
 *
 * Not the source of a `z.literal` on the wire schema — see
 * {@link MobileTransactionSchema.shape.currency} for why the wire type must
 * not narrow to this one value.
 */
export const FALLBACK_MOBILE_CURRENCY = 'AUD';

/**
 * One row of the mobile transaction list. Deliberately only what a list row
 * renders — the detail screen fetches the rest, and a phone on cellular does
 * not pay for fields it will not draw.
 */
export const MobileTransactionSchema = z.object({
  id: z.string(),
  description: z.string(),
  /**
   * Signed decimal dollars, mirroring finance's own wire field exactly:
   * expenses are negative, income positive. Finance persists integer cents
   * and converts once at its REST edge; re-deriving cents here would be a
   * second money representation and a second chance to round differently.
   */
  amount: z.number(),
  /**
   * ISO 4217 code. Left an open string rather than an `enum`/`literal` on
   * purpose, for the same reason as {@link MobileTransactionSchema.shape.type}
   * below: this app is distributed rather than deployed, so a build already on
   * a phone keeps calling the contract it was compiled against for as long as
   * its owner declines to update. A closed enum here becomes a closed Swift
   * enum on the generated client — the day bfm emits a second currency, every
   * installed build fails to decode it, and because this field sits inside an
   * array element, one unrecognised value fails the whole page, not just the
   * row it is on. bfm now emits each transaction's real account currency
   * (POPS-3571), falling back to {@link FALLBACK_MOBILE_CURRENCY} only when
   * that lookup fails — either way this stays an open string.
   */
  currency: z.string(),
  /** Date-only `YYYY-MM-DD`. Finance's transactions carry no time component. */
  date: z.string(),
  /**
   * Finance's semantic transaction type (`purchase`, `income`, `transfer`, …).
   * Left an open string rather than an enum on purpose: finance adding a type
   * must not make every transaction fail to render on the phone. It never
   * carries direction — that is the sign of {@link MobileTransactionSchema.shape.amount}.
   */
  type: z.string(),
  /** Display name of the counterparty, or null when finance has none. */
  entityName: z.string().nullable(),
  tags: z.array(z.string()),
});

export type MobileTransaction = z.infer<typeof MobileTransactionSchema>;

/** The fuller record behind one list row, for the detail screen. */
export const MobileTransactionDetailSchema = MobileTransactionSchema.extend({
  account: z.string(),
  entityId: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  notes: z.string().nullable(),
  /** The other leg of a matched transfer, when finance paired one. */
  relatedTransactionId: z.string().nullable(),
  /** ISO-8601 timestamp of finance's last write to this row. */
  lastEditedTime: z.string(),
});

export type MobileTransactionDetail = z.infer<typeof MobileTransactionDetailSchema>;

/**
 * One page of the transaction list.
 *
 * `nextCursor` is opaque and `null` on the last page — the app asks for the
 * next page by echoing it back, never by counting rows. Cursors rather than
 * offsets because the underlying list mutates: an import that lands while
 * somebody is scrolling shifts every offset by one, so an offset walk re-shows
 * a row it already served and skips one it never did.
 */
export const MobileTransactionsPageSchema = z.object({
  data: z.array(MobileTransactionSchema),
  nextCursor: z.string().nullable(),
});

export type MobileTransactionsPage = z.infer<typeof MobileTransactionsPageSchema>;
