import { z } from 'zod';

/**
 * What the account holds today, as the phone reads it — finance's own
 * `AccountBalance` (POPS-2880) minus `anchor`: the phone shows a date and an
 * `inconsistent` flag, not a checkpoint id to link to. Ledger-signed like
 * everywhere else in this contract — positive is money held, negative is
 * money owed, for assets and liabilities alike; nothing here negates it.
 *
 * `basis: 'transactions'` means finance found no checkpoint to anchor on and
 * the figure is the sum of whatever was imported — net flow, not a balance.
 * A caller that renders this the same way it renders `'checkpoint'` is
 * showing a number that can drift arbitrarily far from what the account
 * actually holds; POPS-2848 owns making that distinction visible.
 */
export const MobileAccountBalanceSchema = z.object({
  balanceCents: z.number().int(),
  asOf: z.string(),
  basis: z.enum(['checkpoint', 'transactions']),
  inconsistent: z.boolean(),
});

export type MobileAccountBalance = z.infer<typeof MobileAccountBalanceSchema>;

/**
 * One account, as the phone reads it.
 *
 * `kind` is left an open string for the same reason as
 * {@link MobileTransactionSchema.shape.type}: finance adding an account kind
 * must not fail every account already on a phone to decode.
 */
export const MobileAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  /** ISO 4217 code, or a points-program code — finance's own vocabulary (POPS-2802). */
  currency: z.string(),
  archived: z.boolean(),
  /** `institutions` id this account is held at, or `null` for cash and person accounts. */
  institutionId: z.string().nullable(),
  /**
   * The institution's display name, resolved by bfm against finance's
   * institutions list (POPS-2803) — finance's account row carries only the id.
   *
   * `null` covers two different facts, and `institutionId` is what separates
   * them: a null id means the account has no institution, while a present id
   * with a null name means the lookup did not come back. A caller that only
   * draws a mark can treat both the same, which is why the resolution failing
   * does not fail the account.
   */
  institutionName: z.string().nullable(),
  /**
   * Who a person ledger is with — finance's `entityDisplayName`, resolved
   * live from contacts on its side. `null` for every other kind.
   */
  contact: z.string().nullable(),
  balance: MobileAccountBalanceSchema,
  /**
   * Every transaction on this account (POPS-2924) — finance's own literal
   * row count, pending and transfer rows included. Not scoped to
   * `balance.asOf`.
   */
  transactionCount: z.number().int(),
});

export type MobileAccount = z.infer<typeof MobileAccountSchema>;

/**
 * One month-end balance, oldest-first within a series. Ledger-signed like
 * {@link MobileAccountBalanceSchema}, and carrying no `basis` of its own:
 * finance derives the whole series from the same checkpoint anchor the
 * current balance uses, so a series is as trustworthy as the balance beside
 * it and not point-by-point.
 */
export const MobileAccountBalancePointSchema = z.object({
  /** ISO month, `YYYY-MM`. */
  month: z.string(),
  balanceCents: z.number().int(),
});

export type MobileAccountBalancePoint = z.infer<typeof MobileAccountBalancePointSchema>;

/**
 * One account and the history behind it, for the phone's account dashboard.
 *
 * Separate from {@link MobileAccountSchema} so the list route stays one call:
 * the history is a second call into finance per account, which is affordable
 * for the one account somebody opened and not for every account they have.
 *
 * `history` is empty rather than absent when finance has nothing to chart, so
 * a caller renders no trend rather than distinguishing two kinds of nothing.
 */
export const MobileAccountDetailSchema = z.object({
  account: MobileAccountSchema,
  history: z.array(MobileAccountBalancePointSchema),
});

export type MobileAccountDetail = z.infer<typeof MobileAccountDetailSchema>;

/**
 * Every account the list screen shows.
 *
 * Unpaged, unlike {@link MobileTransactionsPageSchema}: an account list is
 * small enough in practice to send whole (`AccountsRepository.accounts()`'s
 * own reasoning), so there is no cursor to get wrong.
 */
export const MobileAccountsPageSchema = z.object({
  data: z.array(MobileAccountSchema),
});

export type MobileAccountsPage = z.infer<typeof MobileAccountsPageSchema>;
