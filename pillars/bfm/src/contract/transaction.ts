import { z } from 'zod';

/**
 * The one currency value bfm emits today. Finance carries no currency field
 * at all — the fleet is single-currency and has always assumed it — so this
 * is what {@link import('../api/finance/wire.js').toMobileTransaction} stamps
 * onto every row rather than something finance sent.
 *
 * Not the source of a `z.literal` on the wire schema — see
 * {@link MobileTransactionSchema.shape.currency} for why the wire type must
 * not narrow to this one value.
 */
export const MOBILE_CURRENCY = 'AUD';

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
   * row it is on. bfm only ever emits {@link MOBILE_CURRENCY} today; that is a
   * fact about the current mapping, not a constraint the wire type should
   * assert.
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
