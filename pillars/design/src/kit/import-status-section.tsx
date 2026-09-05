import { feedVerb, type ImportStatus } from '@/fixtures/import-status';
import { ImportStalenessBadge } from '@/kit/import-staleness-badge';

import { Card, CardContent, CardHeader, CardTitle } from '@pops/ui';

import type { Account } from '@/fixtures/accounts';

export const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function quietLine(status: ImportStatus): string {
  if (status.daysQuiet === undefined) return 'Never';
  const quiet = status.daysQuiet === 0 ? 'Today' : `${status.daysQuiet} days quiet`;
  return `${quiet} · expected every ${status.thresholdDays}`;
}

/**
 * When the account last got data, in four numbers a reader can check against
 * each other: the last feed, the newest row, the span the rows cover, and
 * how quiet it has been against its own rhythm. The staleness badge is the
 * same one the grid and the dashboard nudge use, so the three never disagree.
 */
export function ImportStatusSection({
  account,
  status,
}: {
  account: Account;
  status: ImportStatus;
}) {
  const verb = feedVerb(status.kind);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Status</CardTitle>
        <ImportStalenessBadge accountId={account.id} />
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`Last ${verb}`}
          value={status.lastAt ? when(status.lastAt) : 'Never'}
          hint={quietLine(status)}
        />
        <Stat
          label="Newest transaction"
          value={status.newestTransactionDate ? day(status.newestTransactionDate) : '—'}
        />
        <Stat
          label="Covers"
          value={status.span ? `${day(status.span.from)} – ${day(status.span.to)}` : '—'}
        />
        <Stat
          label="Cadence"
          value={status.cadenceDays === undefined ? '—' : `Every ${status.cadenceDays} days`}
          hint={
            status.cadenceDays === undefined
              ? 'Measured after three batches'
              : `Median of the last five ${verb === 'sync' ? 'syncs' : 'imports'}`
          }
        />
      </CardContent>
    </Card>
  );
}
