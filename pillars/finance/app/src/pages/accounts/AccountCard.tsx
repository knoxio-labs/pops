import { AccountChip, Card, cn } from '@pops/ui';

import { toAccountOptions } from '../../components/accounts/toAccountOptions.js';

import type { Account, Institution } from './types';

/**
 * One tile in the accounts grid: `AccountChip`'s `full` variant for identity,
 * plus the kind and person-ledger context `AccountChip` does not carry.
 *
 * Renders no balance: the real `accounts` wire schema has none yet
 * (POPS-2750) — see `AccountOption`'s own docstring in `@pops/ui` for why
 * this library does not fabricate one. Reusing `toAccountOptions` (built for
 * the account picker, POPS-2774) rather than duplicating the institution join.
 */
export function AccountCard({
  account,
  institutions,
  onSelect,
}: {
  account: Account;
  institutions: Institution[];
  onSelect: () => void;
}) {
  const [option] = toAccountOptions([account], institutions);
  if (!option) return null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="block h-full min-h-11 w-full min-w-11 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card
        className={cn(
          'h-full gap-3 px-4 py-4 transition-colors hover:border-primary hover:bg-muted/50',
          account.archivedAt !== null && 'border-dashed opacity-60'
        )}
      >
        <AccountChip account={option} size="full" />
        {account.kind === 'person' && account.entityId === null && (
          <p className="text-xs text-muted-foreground">Pending contact match</p>
        )}
      </Card>
    </button>
  );
}
