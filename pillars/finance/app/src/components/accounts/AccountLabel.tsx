import { AccountChip } from '@pops/ui';

import { resolveAccountOption } from './resolveAccountOption';

import type { AccountOption } from '@pops/ui';

export interface AccountLabelProps {
  accounts: AccountOption[] | undefined;
  /** An account id, or (pre-cutover) a display name — see `resolveAccountOption`. */
  account: string;
  size?: 'compact' | 'inline' | 'full';
  className?: string;
}

/**
 * Renders the account chip once `account` resolves against the live
 * accounts list. Falls back to the plain string while accounts are still
 * loading, or when nothing resolves — a renamed or otherwise unresolvable
 * historical account.
 */
export function AccountLabel({
  accounts,
  account,
  size = 'compact',
  className,
}: AccountLabelProps) {
  const resolved = resolveAccountOption(accounts, account);
  if (!resolved) return <span className={className}>{account}</span>;
  return <AccountChip account={resolved} size={size} className={className} />;
}
