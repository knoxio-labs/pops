import { Skeleton } from '@pops/ui';

import { AccountCard } from './AccountCard';
import { NoAccountsYet, NoMatchingAccounts } from './AccountEmptyStates';
import { AccountListControls } from './AccountListControls';

import type { Account, Institution } from './types';
import type { AccountListFilters } from './useAccountListFilters';

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}

export function AccountsGrid({
  isLoading,
  accounts,
  institutions,
  filters,
  onAdd,
  onSelect,
}: {
  isLoading: boolean;
  accounts: Account[];
  institutions: Institution[];
  filters: AccountListFilters;
  onAdd: () => void;
  onSelect: (account: Account) => void;
}) {
  if (isLoading) return <LoadingSkeleton />;
  if (accounts.length === 0) return <NoAccountsYet onAdd={onAdd} />;
  return (
    <>
      <AccountListControls filters={filters} />
      {filters.visible.length === 0 && <NoMatchingAccounts onClear={filters.clear} />}
      {filters.visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filters.visible.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              institutions={institutions}
              onSelect={() => onSelect(account)}
            />
          ))}
        </div>
      )}
    </>
  );
}
