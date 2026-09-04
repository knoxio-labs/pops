import type { AccountOption } from '@pops/ui';

/**
 * Finds the account an id or a display name refers to. Prefers an id match;
 * falls back to a case-insensitive name match for surfaces whose backend
 * contract has not been repointed to carry an `accountId` yet (POPS-2776
 * left the import review card, the rule preview, and the correction
 * proposal panel on their pre-existing string-only `account` field — see
 * the follow-up ticket noted in that PR).
 */
export function resolveAccountOption(
  accounts: AccountOption[] | undefined,
  accountIdOrName: string
): AccountOption | undefined {
  if (!accounts) return undefined;
  return (
    accounts.find((account) => account.id === accountIdOrName) ??
    accounts.find((account) => account.name.toLowerCase() === accountIdOrName.toLowerCase())
  );
}
