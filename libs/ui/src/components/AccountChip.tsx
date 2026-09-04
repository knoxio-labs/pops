import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';
import { ACCOUNT_KIND_META } from './account-shared/account-kinds';
import { initials } from './account-shared/initials';

import type { AccountOption } from './account-shared/types';

const MARK_SIZE = {
  sm: 'h-5 w-5 rounded-md text-[9px]',
  md: 'h-9 w-9 rounded-md text-xs',
} as const;

/**
 * The mark that identifies an account: its institution's logo when one has
 * been resolved, the institution's initials on its brand colour when not,
 * and the kind's icon for accounts that belong to no institution at all —
 * cash in a drawer and a person ledger have no bank to show.
 *
 * Per the `account-chip-identity` decision: institution-led, not kind-led.
 * Plain markup rather than the `Avatar` primitive — `Avatar`'s image only
 * renders once its own load event fires, which never happens for a resolved
 * logo in a test environment, and there is no resolved logo in production
 * yet either (POPS-2804, the upload flow, has not shipped).
 */
export function AccountMark({
  account,
  size = 'sm',
}: {
  account: AccountOption;
  size?: keyof typeof MARK_SIZE;
}) {
  const { institution } = account;
  const shape = cn('flex shrink-0 items-center justify-center overflow-hidden', MARK_SIZE[size]);
  if (institution?.logoUrl) {
    return <img src={institution.logoUrl} alt="" className={shape} />;
  }
  if (institution) {
    return (
      <span
        className={cn(shape, 'font-semibold text-white')}
        style={{ backgroundColor: institution.colour }}
        aria-hidden
      >
        {initials(institution.name)}
      </span>
    );
  }
  const { icon: Icon } = ACCOUNT_KIND_META[account.kind];
  return (
    <span className={cn(shape, 'bg-muted')} aria-hidden>
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4.5 w-4.5'} />
    </span>
  );
}

export interface AccountChipProps {
  account: AccountOption;
  size?: 'compact' | 'inline' | 'full';
  className?: string;
}

/**
 * An account wherever one is named. `compact` fits a table cell, `inline`
 * sits in a sentence and carries its own background, `full` heads a card.
 */
export function AccountChip({ account, size = 'compact', className }: AccountChipProps) {
  if (size === 'full') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-3',
          account.archived && 'opacity-60',
          className
        )}
      >
        <AccountMark account={account} size="md" />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{account.name}</span>
            {account.archived && (
              <Badge variant="outline" className="text-xs">
                Archived
              </Badge>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {account.institution?.name ?? ACCOUNT_KIND_META[account.kind].label}
          </span>
        </span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 align-middle text-sm',
        size === 'inline' && 'rounded-full bg-muted px-2 py-0.5',
        account.archived && 'opacity-60',
        className
      )}
    >
      <AccountMark account={account} />
      <span className="truncate">{account.name}</span>
      {account.archived && <span className="text-xs text-muted-foreground">(archived)</span>}
    </span>
  );
}
