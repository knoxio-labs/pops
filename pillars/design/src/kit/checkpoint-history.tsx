import { type Account } from '@/fixtures/accounts';
import { type Checkpoint, checkpointsFor } from '@/fixtures/checkpoints';
import { formatBalance } from '@/fixtures/currencies';
import { CheckpointSourceBadge } from '@/kit/checkpoint-source-badge';
import { balanceTone } from '@/kit/ledger-tone';
import { TriangleAlert, X } from 'lucide-react';

import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@pops/ui';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

function CheckpointRow({ account, checkpoint }: { account: Account; checkpoint: Checkpoint }) {
  const { expectedBalance } = checkpoint;
  return (
    <>
      <TableRow>
        <TableCell className="text-sm tabular-nums text-muted-foreground">
          {day(checkpoint.asOf)}
        </TableCell>
        <TableCell>
          <CheckpointSourceBadge source={checkpoint.source} />
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">{checkpoint.note ?? '—'}</TableCell>
        <TableCell
          className={cn('text-right text-sm font-medium tabular-nums', balanceTone(account))}
        >
          {formatBalance(checkpoint.balance, account.currency)}
        </TableCell>
        <TableCell className="w-8">
          {checkpoint.source === 'manual' && (
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete checkpoint">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </TableCell>
      </TableRow>
      {expectedBalance !== undefined && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="pt-0">
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Transactions since the last checkpoint predicted{' '}
                <span className="font-medium tabular-nums">
                  {formatBalance(expectedBalance, account.currency)}
                </span>
                . Off by{' '}
                <span className="font-medium tabular-nums">
                  {formatBalance(Math.abs(checkpoint.balance - expectedBalance), account.currency)}
                </span>{' '}
                — a transaction may be missing, duplicated, or misdated.
              </span>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/**
 * Every checkpoint an account has taken, newest first. Empty renders nothing
 * rather than a placeholder row — an account with no checkpoints yet is the
 * common case for a brand new one, not an error.
 */
export function CheckpointHistory({ account }: { account: Account }) {
  const checkpoints = checkpointsFor(account.id);
  if (checkpoints.length === 0) return null;
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
          <CheckpointRow key={checkpoint.id} account={account} checkpoint={checkpoint} />
        ))}
      </TableBody>
    </Table>
  );
}
