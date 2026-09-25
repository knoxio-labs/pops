/**
 * Which finance account a payment hint settles on, learned from links.
 *
 * A merchant names the card it charged (`Visa - 7373`); finance names the
 * account the charge was posted to, and records no card number. The two
 * only meet through links, so the mapping is read off them rather than
 * kept in a table that would need maintaining by hand.
 */

/** One existing link, as far as learning needs it. */
export interface LinkedHint {
  readonly paymentHint: string;
  readonly transactionUri: string;
}

/**
 * Map each hint to the one account every one of its links landed on.
 *
 * A hint whose links span two accounts maps to nothing: the evidence
 * disagrees, and narrowing on it would block the charge's real settlement.
 * A link whose transaction is not in `accountOf` is no evidence either
 * way — the sweep only knows the accounts of the transactions it fetched —
 * so it is skipped rather than counted as a disagreement.
 */
export function learnCardAccounts(
  links: readonly LinkedHint[],
  accountOf: ReadonlyMap<string, string>
): ReadonlyMap<string, string> {
  const seen = new Map<string, Set<string>>();
  for (const link of links) {
    const account = accountOf.get(link.transactionUri);
    if (account === undefined) continue;
    const accounts = seen.get(link.paymentHint) ?? new Set<string>();
    accounts.add(account);
    seen.set(link.paymentHint, accounts);
  }

  const mapping = new Map<string, string>();
  for (const [hint, accounts] of seen) {
    const [only, ...others] = accounts;
    if (only !== undefined && others.length === 0) mapping.set(hint, only);
  }
  return mapping;
}
