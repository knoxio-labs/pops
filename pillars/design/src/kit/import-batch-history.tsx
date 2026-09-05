import { type ImportBatch } from '@/fixtures/import-sources';
import { ImportSourceBadge } from '@/kit/import-source-badge';
import { day, when } from '@/kit/import-status-section';
import { Flag } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pops/ui';

import type { Account } from '@/fixtures/accounts';

function spanLabel(batch: ImportBatch): string {
  if (!batch.from || !batch.to) return '—';
  return batch.from === batch.to ? day(batch.from) : `${day(batch.from)} – ${day(batch.to)}`;
}

/**
 * Every batch that fed the account, newest first, append-only: a batch is
 * what an import did, and there is no delete because undoing an import is a
 * transaction-level act that would leave this row true. A zero-row batch is
 * kept in the list on purpose — for a synced account "checked, nothing new"
 * is the fact the cadence is measured from.
 */
export function ImportBatchHistory({
  account,
  batches,
}: {
  account: Account;
  batches: ImportBatch[];
}) {
  if (batches.length === 0) return null;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Covers</TableHead>
          <TableHead className="text-right">Rows</TableHead>
          <TableHead className="w-28">Checkpoint</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((batch) => (
          <TableRow key={batch.id} className={batch.rowCount === 0 ? 'text-muted-foreground' : ''}>
            <TableCell className="text-sm tabular-nums text-muted-foreground">
              {when(batch.at)}
            </TableCell>
            <TableCell>
              <ImportSourceBadge kind={batch.kind} format={batch.format} />
            </TableCell>
            <TableCell className="text-sm tabular-nums">{spanLabel(batch)}</TableCell>
            <TableCell className="text-right text-sm tabular-nums">
              {batch.rowCount === 0 ? 'nothing new' : batch.rowCount.toLocaleString('en-AU')}
            </TableCell>
            <TableCell>
              {batch.checkpointId && (
                <a
                  href={`#/accounts/${account.id}/checkpoints#${batch.checkpointId}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  <Flag className="h-3 w-3" />
                  Minted
                </a>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
