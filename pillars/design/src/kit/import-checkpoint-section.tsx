import { day } from '@/kit/import-status-section';
import { Scale } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, formatCents } from '@pops/ui';

export interface LiveCheckpoint {
  balanceMinor: number;
  currency: string;
  /** The date of the newest row the balance was reported with. */
  asOf: string;
  /** After commit: what the ledger came to, for the agreement line. */
  ledgerMinor?: number;
}

/**
 * The one thing a live import commits that a file never did: the balance
 * the provider reported with its newest row. It is recorded as an
 * `import` checkpoint at commit, not on arrival — a checkpoint dated
 * before rows that are not in the ledger yet would flag every day until
 * they were. The checkpoints page is where any disagreement lives after.
 */
export function CheckpointSection({ checkpoint }: { checkpoint: LiveCheckpoint }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Scale className="h-4 w-4 text-muted-foreground" aria-hidden />
        <CardTitle className="text-sm font-medium">Balance checkpoint</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>
          Up reported{' '}
          <span className="font-medium tabular-nums">
            {formatCents(checkpoint.balanceMinor, checkpoint.currency)}
          </span>{' '}
          with the newest row, on {day(checkpoint.asOf)}.
        </p>
        <p className="text-muted-foreground">
          Committing records it as an import checkpoint on that date. If the ledger disagrees once
          these rows are in, the account’s checkpoints page says by how much.
        </p>
      </CardContent>
    </Card>
  );
}

/** How the ledger came out against the reported balance, for the summary. */
export function agreementTail(checkpoint: LiveCheckpoint): string {
  const ledger = checkpoint.ledgerMinor;
  if (ledger === undefined) return '.';
  const delta = ledger - checkpoint.balanceMinor;
  if (delta === 0) return ' · the ledger agrees.';
  return ` · the ledger is off by ${formatCents(Math.abs(delta), checkpoint.currency)}.`;
}

export function CheckpointResultLine({ checkpoint }: { checkpoint: LiveCheckpoint }) {
  return (
    <p className="text-center text-sm text-muted-foreground">
      Checkpoint recorded: {formatCents(checkpoint.balanceMinor, checkpoint.currency)} as of{' '}
      {day(checkpoint.asOf)}
      {agreementTail(checkpoint)}
    </p>
  );
}
