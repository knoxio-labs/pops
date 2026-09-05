import { TriangleAlert, X } from 'lucide-react';

import { centsToDollars, formatBalance, type CurrencyFormat } from '@pops/finance';
import {
  Alert,
  AlertDescription,
  balanceTone,
  Button,
  CheckpointSourceBadge,
  cn,
  formatDate,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import { isInconsistent, type Checkpoint } from './types';

/**
 * The destructive callout beneath a disagreeing checkpoint's row: what the
 * ledger predicted, the actual figure, and the gap between them. Absent
 * whenever `expectedBalanceCents` is null — the earliest checkpoint anchors
 * the account and has nothing to be measured against (ADR-051).
 */
function DisagreementCallout({
  checkpoint,
  currency,
}: {
  checkpoint: Checkpoint;
  currency: CurrencyFormat;
}) {
  if (checkpoint.expectedBalanceCents === null) return null;
  const diffCents = Math.abs(checkpoint.balanceCents - checkpoint.expectedBalanceCents);
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={5} className="pt-0">
        <Alert variant="destructive" className="py-2">
          <TriangleAlert />
          <AlertDescription>
            Transactions since the last checkpoint predicted{' '}
            <span className="font-medium tabular-nums">
              {formatBalance(centsToDollars(checkpoint.expectedBalanceCents), currency)}
            </span>
            . Off by{' '}
            <span className="font-medium tabular-nums">
              {formatBalance(centsToDollars(diffCents), currency)}
            </span>{' '}
            — a transaction may be missing, duplicated, or misdated.
          </AlertDescription>
        </Alert>
      </TableCell>
    </TableRow>
  );
}

function CheckpointRow({
  checkpoint,
  currency,
  onDelete,
}: {
  checkpoint: Checkpoint;
  currency: CurrencyFormat;
  onDelete: (checkpointId: string) => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell className="text-sm tabular-nums text-muted-foreground">
          {formatDate(checkpoint.asOf)}
        </TableCell>
        <TableCell>
          <CheckpointSourceBadge source={checkpoint.source} />
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">{checkpoint.note ?? '—'}</TableCell>
        <TableCell
          className={cn(
            'text-right text-sm font-medium tabular-nums',
            balanceTone(checkpoint.balanceCents, currency.kind)
          )}
        >
          {formatBalance(centsToDollars(checkpoint.balanceCents), currency)}
        </TableCell>
        <TableCell>
          {checkpoint.source === 'manual' && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete the ${formatDate(checkpoint.asOf)} checkpoint`}
              onClick={() => onDelete(checkpoint.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </TableCell>
      </TableRow>
      {isInconsistent(checkpoint) && (
        <DisagreementCallout checkpoint={checkpoint} currency={currency} />
      )}
    </>
  );
}

/**
 * Every checkpoint an account has taken, newest first — the server already
 * sorts this way (`checkpoints.list`). The delete affordance only ever
 * appears on a `manual` row: the API 409s a delete of an `import` or
 * `statement` one, so this never offers a control that would just bounce.
 */
export function CheckpointHistory({
  checkpoints,
  currency,
  onDelete,
}: {
  checkpoints: Checkpoint[];
  currency: CurrencyFormat;
  onDelete: (checkpointId: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>As of</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Note</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {checkpoints.map((checkpoint) => (
          <CheckpointRow
            key={checkpoint.id}
            checkpoint={checkpoint}
            currency={currency}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}
