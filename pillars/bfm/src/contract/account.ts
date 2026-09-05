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
  balance: MobileAccountBalanceSchema,
});

export type MobileAccount = z.infer<typeof MobileAccountSchema>;

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
