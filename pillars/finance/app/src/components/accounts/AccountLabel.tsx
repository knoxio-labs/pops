import { Link } from 'react-router';

import { AccountChip, cn } from '@pops/ui';

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
 *
 * A resolved chip is a link to that account's dashboard (POPS-2805) — the
 * one place this resolution happens, so every caller (the import review
 * panel, recent transactions, the rule preview) gets "reachable from every
 * chip" for free rather than wiring navigation itself.
 */
export function AccountLabel({
  accounts,
  account,
  size = 'compact',
  className,
}: AccountLabelProps) {
  const resolved = resolveAccountOption(accounts, account);
  if (!resolved) return <span className={className}>{account}</span>;
  return (
    <Link
      to={`/finance/accounts/${resolved.id}`}
      className={cn(
        'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      <AccountChip account={resolved} size={size} />
    </Link>
  );
}
