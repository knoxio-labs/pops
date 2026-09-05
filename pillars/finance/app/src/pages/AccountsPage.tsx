import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';

import { Alert, Button, PageHeader } from '@pops/ui';

import { AccountFormDialog } from './accounts/AccountFormDialog';
import { AccountsGrid } from './accounts/AccountsGrid';
import { useAccountListFilters } from './accounts/useAccountListFilters';
import { useAccountsPage } from './accounts/useAccountsPage';

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Accounts" />
      <Alert variant="destructive">
        <p className="font-semibold">Failed to load accounts</p>
        <p className="text-sm">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      </Alert>
    </div>
  );
}

export function AccountsPage() {
  const navigate = useNavigate();
  const state = useAccountsPage();
  const accounts = state.accounts.data?.data ?? [];
  const institutions = state.institutions.data?.data ?? [];
  const currencies = state.currencies.data?.data ?? [];
  const filters = useAccountListFilters(accounts, institutions);
  // The grid tints and subtotals by currency kind — a points balance is
  // neutral and stays out of the fiat totals. `currencies` is its own query
  // with no ordering against `accounts`, so rendering on accounts alone would
  // fall back to fiat/2dp for every account: a points balance would flash in a
  // money tone, formatted with a currency symbol, and be summed into a dollar
  // subtotal until the second query landed.
  const isLoading = state.accounts.isLoading || state.currencies.isLoading;

  if (state.accounts.error) {
    return (
      <ErrorPanel message={state.accounts.error.message} onRetry={() => state.accounts.refetch()} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description={isLoading ? undefined : filters.description}
        actions={
          <Button onClick={state.handleAdd} prefix={<Plus className="h-4 w-4" />}>
            Add account
          </Button>
        }
      />
      <AccountsGrid
        isLoading={isLoading}
        accounts={accounts}
        institutions={institutions}
        currencies={currencies}
        filters={filters}
        onAdd={state.handleAdd}
        onSelect={(account) => navigate(`/finance/accounts/${account.id}`)}
      />
      <AccountFormDialog
        open={state.isDialogOpen}
        onOpenChange={state.setIsDialogOpen}
        editingAccount={state.editingAccount}
        form={state.form}
        institutions={institutions}
        currencies={currencies}
        onCreateInstitution={state.createInstitution}
        isSubmitting={state.isSubmitting}
        onSubmit={state.onSubmit}
        onArchiveToggle={state.onArchiveToggle}
        isArchiving={state.isArchiving}
      />
    </div>
  );
}
