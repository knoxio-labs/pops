import { useMemo } from 'react';
import { useParams } from 'react-router';

import { useSetPageContext } from '@pops/navigation';
import { Alert, Button, EmptyState, Skeleton } from '@pops/ui';

import { AccountDetailHeader } from './account-detail/AccountDetailHeader';
import { BalanceCard } from './account-detail/BalanceCard';
import { ModuleGrid } from './account-detail/ModuleGrid';
import { RecentTransactionsSection } from './account-detail/RecentTransactionsSection';
import { useAccountDetailPage } from './account-detail/useAccountDetailPage';
import { useAddTransactionDialog } from './account-detail/useAddTransactionDialog';
import { AccountFormDialog, ArchivedBanner } from './accounts/AccountFormDialog';
import { TransactionFormDialog } from './transactions/TransactionFormDialog';

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <p className="font-semibold">Failed to load this account</p>
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
        Try again
      </Button>
    </Alert>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/** A currency row shaped for `formatBalance`, falling back to a fiat 2-decimal guess if the code never resolved. */
function currencyFormat(
  currency: { symbol: string | null; decimals: number; kind: 'fiat' | 'points' } | null
) {
  return currency ?? { symbol: null, decimals: 2, kind: 'fiat' as const };
}

function useAccountPageContext(accountId: string, name: string | undefined): void {
  const entity = useMemo(
    () => ({
      uri: `pops:finance/account/${accountId}`,
      type: 'account',
      title: name ?? '',
    }),
    [accountId, name]
  );
  useSetPageContext({ page: 'account-detail', pageType: 'drill-down', entity });
}

/**
 * `/accounts/:id` — the account dashboard (POPS-2805). Header, the balance
 * card and its twelve-month trend (POPS-2887), an empty module grid
 * (POPS-2807's seam) and recent transactions.
 */
export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = id ?? '';
  const state = useAccountDetailPage(accountId);
  const addTransaction = useAddTransactionDialog(accountId);
  useAccountPageContext(accountId, state.account?.name);

  if (state.accounts.error) {
    return (
      <ErrorPanel message={state.accounts.error.message} onRetry={() => state.accounts.refetch()} />
    );
  }
  if (state.isLoading) {
    return <LoadingSkeleton />;
  }
  const { account } = state;
  if (!account) {
    return <EmptyState title="No such account" description="It may have been deleted." />;
  }

  const isArchived = account.archivedAt !== null;

  return (
    <div className="space-y-6">
      {isArchived && <ArchivedBanner />}
      <AccountDetailHeader
        account={account}
        onEdit={() => state.handleEdit(account)}
        onAddTransaction={addTransaction.openDialog}
      />
      <BalanceCard account={account} currency={currencyFormat(state.currency)} />
      <ModuleGrid kind={account.kind} />
      <RecentTransactionsSection accountId={accountId} currency={currencyFormat(state.currency)} />
      <AccountFormDialog
        open={state.isDialogOpen}
        onOpenChange={state.setIsDialogOpen}
        editingAccount={state.editingAccount}
        form={state.form}
        bankEntities={state.bankEntities}
        currencies={state.currencies}
        onCreateBankEntity={state.createBankEntity}
        isSubmitting={state.isSubmitting}
        onSubmit={state.onSubmit}
        onArchiveToggle={state.onArchiveToggle}
        isArchiving={state.isArchiving}
      />
      <TransactionFormDialog
        open={addTransaction.isDialogOpen}
        onOpenChange={addTransaction.setIsDialogOpen}
        editingTransaction={null}
        form={addTransaction.form}
        isSubmitting={addTransaction.isSubmitting}
        onSubmit={addTransaction.onSubmit}
        entities={addTransaction.entities}
        accounts={addTransaction.accounts}
      />
    </div>
  );
}
