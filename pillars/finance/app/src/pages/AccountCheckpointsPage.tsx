import { Plus } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { AccountMark, Button, EmptyState, PageHeader, Skeleton } from '@pops/ui';

import { toAccountOptions } from '../components/accounts/toAccountOptions';
import { CheckpointFormDialog } from './account-checkpoints/CheckpointFormDialog';
import { CheckpointsBody } from './account-checkpoints/CheckpointsBody';
import { ErrorPanel } from './account-checkpoints/ErrorPanel';
import { InconsistencyBanner } from './account-checkpoints/InconsistencyBanner';
import { useAccountCheckpointsActions } from './account-checkpoints/useAccountCheckpointsActions';
import { useAccountCheckpointsPage } from './account-checkpoints/useAccountCheckpointsPage';

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full" />
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

/**
 * `/accounts/:id/checkpoints` (POPS-2888) — the record behind the account
 * page's balance: every checkpoint taken, adding one by hand, deleting a
 * manual mistake, and the detail behind an inconsistency flag. Checkpoints
 * are plumbing (POPS-2750): this is their own page precisely so the account
 * dashboard never has to be more than a result and a link.
 */
export function AccountCheckpointsPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = id ?? '';
  const state = useAccountCheckpointsPage(accountId);
  const actions = useAccountCheckpointsActions(accountId, state.account);

  if (state.accounts.error) {
    return (
      <ErrorPanel
        heading="Failed to load this account"
        message={state.accounts.error.message}
        onRetry={() => state.accounts.refetch()}
      />
    );
  }
  if (state.isLoading) {
    return <LoadingSkeleton />;
  }
  const { account } = state;
  if (!account) {
    return <EmptyState title="No such account" description="It may have been deleted." />;
  }

  const [option] = toAccountOptions([account], state.institutions);
  const checkpoints = state.checkpoints.data?.data ?? [];
  const currency = currencyFormat(state.currency);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/finance/accounts/${account.id}`}
        icon={option && <AccountMark account={option} size="md" />}
        title={`Checkpoints — ${account.name}`}
        description="A checkpoint is a balance confirmed against something outside the ledger. The balance shown elsewhere is always computed forward from the nearest one below."
        actions={
          <Button size="sm" onClick={actions.openDialog}>
            <Plus className="h-4 w-4" />
            Add checkpoint
          </Button>
        }
        renderLink={Link}
      />
      <InconsistencyBanner latest={checkpoints[0]} currency={currency} />
      <CheckpointsBody
        query={state.checkpoints}
        currency={currency}
        onDelete={actions.deleteCheckpoint}
      />
      <CheckpointFormDialog
        account={account}
        currencyCode={account.currency}
        open={actions.isDialogOpen}
        onOpenChange={actions.setIsDialogOpen}
        form={actions.form}
        onSubmit={actions.onSubmit}
        isSubmitting={actions.isSubmitting}
      />
    </div>
  );
}
