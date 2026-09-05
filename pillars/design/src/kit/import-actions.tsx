import { type ImportConfig } from '@/fixtures/import-sources';
import { CircleCheck, FileUp, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import type { Account } from '@/fixtures/accounts';

/** What `Sync now` is doing, or last did. */
export type SyncActivity =
  | { phase: 'idle' }
  | { phase: 'running'; step: string }
  | { phase: 'done'; imported: number; settled: number; deltaCents?: number }
  | { phase: 'failed'; reason: string };

const IDLE: SyncActivity = { phase: 'idle' };

function syncBlocker(config: ImportConfig | undefined): string | undefined {
  if (config?.kind !== 'api') return undefined;
  if (config.connection === 'token-missing')
    return `Set the ${config.secretName ?? 'token'} secret first`;
  if (config.connection !== 'connected') return 'Connect the account first';
  return undefined;
}

function SyncOutcome({ activity, account }: { activity: SyncActivity; account: Account }) {
  if (activity.phase === 'running') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {activity.step}
      </p>
    );
  }
  if (activity.phase === 'done') {
    const mismatch = activity.deltaCents !== undefined && activity.deltaCents !== 0;
    return (
      <p
        className={cn(
          'flex items-center gap-2 text-sm',
          mismatch ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {mismatch ? (
          <TriangleAlert className="h-4 w-4" />
        ) : (
          <CircleCheck className="h-4 w-4 text-primary" />
        )}
        {activity.imported} new, {activity.settled} settled
        {mismatch
          ? ` · ledger off by ${(Math.abs(activity.deltaCents ?? 0) / 100).toFixed(2)} ${account.currency} against the bank balance`
          : ' · balance agrees with the bank'}
      </p>
    );
  }
  if (activity.phase === 'failed') {
    return (
      <p className="flex items-center gap-2 text-sm text-destructive">
        <TriangleAlert className="h-4 w-4" />
        {activity.reason}
      </p>
    );
  }
  return null;
}

/**
 * The two things a person can do from here. `Import file` opens the wizard
 * already scoped to this account (POPS-2875). `Sync now` exists only for an
 * `api` source and is disabled with its reason rather than hidden, because a
 * missing token is a thing to fix, not a thing to not know about; its
 * progress and result render inline so the page is where the answer lands.
 */
export function ImportActions({
  account,
  config,
  activity = IDLE,
}: {
  account: Account;
  config?: ImportConfig;
  activity?: SyncActivity;
}) {
  const blocker = syncBlocker(config);
  const running = activity.phase === 'running';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={config?.kind === 'api' ? 'outline' : 'default'} asChild>
          <a href={`#/imports/new?account=${account.id}`}>
            <FileUp className="h-4 w-4" />
            Import file
          </a>
        </Button>
        {config?.kind === 'api' && (
          <Button size="sm" disabled={blocker !== undefined || running} title={blocker}>
            <RefreshCw className={cn('h-4 w-4', running && 'animate-spin')} />
            {running ? 'Syncing…' : 'Sync now'}
          </Button>
        )}
      </div>
      {blocker && <p className="text-xs text-muted-foreground">{blocker}</p>}
      <SyncOutcome activity={activity} account={account} />
    </div>
  );
}
