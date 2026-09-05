import { accounts } from '@/fixtures/accounts';
import { checkpointsFor, inconsistentCheckpoint } from '@/fixtures/checkpoints';
import { formatBalance } from '@/fixtures/currencies';
import { day } from '@/kit/account-dashboard';
import { AddCheckpointDialog } from '@/kit/checkpoint-form';
import { CheckpointHistory } from '@/kit/checkpoint-history';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { Plus, TriangleAlert } from 'lucide-react';

import { Button, EmptyState, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Account } from '@/fixtures/accounts';

export const meta: ScreenMeta = { title: 'Account checkpoints', order: 6, frame: 'web' };

/**
 * The one thing this page leads with when it's true: a checkpoint that
 * disagreed with the ledger, named in the account's own terms rather than
 * left to a reader to work out from a table row further down.
 */
function InconsistencyBanner({ account }: { account: Account }) {
  const flagged = inconsistentCheckpoint(account.id);
  if (!flagged || flagged.expectedBalance === undefined) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        The {day(flagged.asOf)} checkpoint says{' '}
        <span className="font-medium tabular-nums">
          {formatBalance(flagged.balance, account.currency)}
        </span>
        , but transactions since the prior checkpoint predicted{' '}
        <span className="font-medium tabular-nums">
          {formatBalance(flagged.expectedBalance, account.currency)}
        </span>
        . Something in between is missing, duplicated, or misdated.
      </p>
    </div>
  );
}

/**
 * Checkpoints, on their own page rather than folded into the account
 * dashboard: the balance card only ever needs the *result* — an as-of date
 * and a flag — and this is where the record behind that result lives. Most
 * of it won't be typed by hand for long: a parsed statement (POPS-2752) or a
 * scanned receipt is as authoritative as anything entered here, and will
 * file its own checkpoint the same way. What's manual today is the gap
 * those sources haven't closed yet, not the intended long-run shape.
 */
function AccountCheckpoints({ account }: { account: Account }) {
  const checkpoints = checkpointsFor(account.id);
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        backHref={`#/accounts/${account.id}`}
        icon={<AccountAvatar account={account} size="md" />}
        title={`Checkpoints — ${account.name}`}
        description="A checkpoint is a balance confirmed against something outside the ledger. The balance shown elsewhere is always computed forward from the nearest one below."
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Add checkpoint
          </Button>
        }
      />
      <InconsistencyBanner account={account} />
      {checkpoints.length > 0 ? (
        <CheckpointHistory account={account} />
      ) : (
        <EmptyState
          title="No checkpoints yet"
          description="Add one when you've confirmed this balance against the bank, a statement, or a receipt."
        />
      )}
    </div>
  );
}

const byId = new Map(accounts.map((a) => [a.id, a]));

const detail = (id: string) => () => {
  const account = byId.get(id);
  return account ? (
    <AccountCheckpoints account={account} />
  ) : (
    <EmptyState title="No such account" />
  );
};

function addCheckpointState() {
  const account = byId.get('a1');
  if (!account) return <EmptyState title="No such account" />;
  return (
    <>
      <AccountCheckpoints account={account} />
      <AddCheckpointDialog account={account} />
    </>
  );
}

export const states: ScreenStates = {
  empty: detail('a11'),
  inconsistent: detail('a2'),
  'add-checkpoint': addCheckpointState,
};

export default detail('a1');
