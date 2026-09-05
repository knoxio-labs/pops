import { EmptyState, Skeleton } from '@pops/ui';

import { CheckpointHistory } from './CheckpointHistory';
import { ErrorPanel } from './ErrorPanel';

import type { UseQueryResult } from '@tanstack/react-query';

import type { CurrencyFormat } from '@pops/finance';

import type { Checkpoint } from './types';

interface CheckpointsQueryData {
  data: Checkpoint[];
}

/**
 * The history section's own error/loading/empty/table switch, split out of
 * the page component so that switch is one place rather than a ternary
 * chain — the checkpoints list has its own query and can fail or still be
 * loading independently of the account it belongs to.
 */
export function CheckpointsBody({
  query,
  currency,
  onDelete,
}: {
  query: UseQueryResult<CheckpointsQueryData, Error>;
  currency: CurrencyFormat;
  onDelete: (checkpointId: string) => void;
}) {
  if (query.error) {
    return (
      <ErrorPanel
        heading="Failed to load checkpoints"
        message={query.error.message}
        onRetry={() => query.refetch()}
      />
    );
  }
  if (query.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }
  const checkpoints = query.data?.data ?? [];
  if (checkpoints.length === 0) {
    return (
      <EmptyState
        title="No checkpoints yet"
        description="Add one when you've confirmed this balance against the bank, a statement, or a receipt."
      />
    );
  }
  return <CheckpointHistory checkpoints={checkpoints} currency={currency} onDelete={onDelete} />;
}
