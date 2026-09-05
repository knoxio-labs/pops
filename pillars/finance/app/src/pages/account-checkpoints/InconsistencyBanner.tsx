import { TriangleAlert } from 'lucide-react';

import { centsToDollars, formatBalance, type CurrencyFormat } from '@pops/finance';
import { Alert, AlertDescription, formatDate } from '@pops/ui';

import { isInconsistent, type Checkpoint } from './types';

/**
 * The one thing this page leads with when it's true: the latest checkpoint
 * disagreed with the ledger, named in the account's own terms rather than
 * left for a reader to work out from a table row further down. Absent
 * whenever the newest checkpoint agrees — an older flagged one followed by a
 * consistent newer one has been re-anchored, so only the latest counts.
 */
export function InconsistencyBanner({
  latest,
  currency,
}: {
  latest: Checkpoint | undefined;
  currency: CurrencyFormat;
}) {
  if (!latest || !isInconsistent(latest) || latest.expectedBalanceCents === null) return null;
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertDescription>
        The {formatDate(latest.asOf)} checkpoint says{' '}
        <span className="font-medium tabular-nums">
          {formatBalance(centsToDollars(latest.balanceCents), currency)}
        </span>
        , but transactions since the prior checkpoint predicted{' '}
        <span className="font-medium tabular-nums">
          {formatBalance(centsToDollars(latest.expectedBalanceCents), currency)}
        </span>
        . Something in between is missing, duplicated, or misdated.
      </AlertDescription>
    </Alert>
  );
}
