import { z } from 'zod';

/**
 * One account, as the phone reads it.
 *
 * Deliberately missing a balance: finance's own `accounts` wire schema
 * carries none yet (POPS-2750). Adding one here ahead of finance emitting a
 * real figure would mean fabricating money shown on a dashboard, which is
 * worse than the field being absent — `BFMAccountsRepository` stays unbound
 * to a fake account source until POPS-2750 lands (POPS-2848).
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
