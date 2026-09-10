import { liveImportFor, type PendingImport } from '@/fixtures/pending-imports';
import { day, when } from '@/kit/import-status-section';
import { Radio, RefreshCw } from 'lucide-react';

import { Button, Card, CardContent, CardHeader, CardTitle, formatCents } from '@pops/ui';

import type { Account } from '@/fixtures/accounts';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

function Arrived({ item, account }: { item: PendingImport; account: Account }) {
  const need = item.unresolvedCount ?? 0;
  return (
    <>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Arrived" value={`${item.rowCount} transactions`} />
        <Stat
          label="Covering"
          value={item.span ? `${day(item.span.from)} – ${day(item.span.to)}` : 'Not recorded'}
        />
        <Stat label="Newest" value={when(item.savedAt)} />
        <Stat
          label="Balance reported"
          value={
            item.balanceReported === undefined
              ? 'Not reported'
              : formatCents(item.balanceReported, account.currency)
          }
        />
      </CardContent>
      <CardContent className="flex items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          {need === 0 ? 'Nothing needs a decision yet.' : `${need} need a decision.`}
        </p>
        <Button size="sm">Next: process what arrived</Button>
      </CardContent>
    </>
  );
}

function NothingYet() {
  return (
    <CardContent className="flex items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Nothing has arrived since the last sync. Up sends each transaction as it settles, so the
        next one appears here on its own.
      </p>
      <Button size="sm" variant="outline" prefix={<RefreshCw className="h-4 w-4" />}>
        Sync now
      </Button>
    </CardContent>
  );
}

/**
 * What a live-fed account has waiting, shown as soon as an Up account is
 * picked. There is no file, so Upload and Map columns are skipped: Next
 * goes straight to Process.
 */
export function LiveFeedSection({ account }: { account: Account }) {
  const item = liveImportFor(account.id);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Radio className="h-4 w-4 text-primary" aria-hidden />
        <CardTitle className="text-sm font-medium">
          {item ? 'Waiting from the Up live feed' : 'Up live feed'}
        </CardTitle>
      </CardHeader>
      {item ? <Arrived item={item} account={account} /> : <NothingYet />}
    </Card>
  );
}
