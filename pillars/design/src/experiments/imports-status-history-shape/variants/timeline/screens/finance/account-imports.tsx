import { accounts } from '@/fixtures/accounts';
import { batchesFor, type ImportBatch, type ImportConfig } from '@/fixtures/import-sources';
import { feedVerb, importStatusFor, type ImportStatus } from '@/fixtures/import-status';
import { ImportActions, type SyncActivity } from '@/kit/import-actions';
import { ImportSourceBadge } from '@/kit/import-source-badge';
import { ImportSourceSection } from '@/kit/import-source-section';
import { ImportStalenessBadge } from '@/kit/import-staleness-badge';
import { day, when } from '@/kit/import-status-section';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { Flag } from 'lucide-react';

import { cn, EmptyState, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Account } from '@/fixtures/accounts';

export const meta: ScreenMeta = { title: 'Account imports', order: 7, frame: 'web' };

function Node({
  marker,
  title,
  detail,
  muted,
  children,
}: {
  marker: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className={cn('relative pb-6 pl-8 last:pb-0', muted && 'text-muted-foreground')}>
      <span className="absolute top-1 left-0 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-[10px]">
        {marker}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{title}</span>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </div>
      {children}
    </li>
  );
}

function quietLine(status: ImportStatus): string {
  const verb = feedVerb(status.kind);
  if (status.daysQuiet === undefined) return `never ${verb}ed`;
  const quiet = status.daysQuiet === 0 ? 'fed today' : `${status.daysQuiet} days quiet`;
  return `${quiet} · expected every ${status.thresholdDays}`;
}

/**
 * The head of the timeline is not a batch, it is now: how quiet the account
 * has been against its rhythm, and what the rows reach up to. It says the
 * same four things the status panel says, but as the first entry in the
 * sequence they were measured from.
 */
function NowNode({ status, account }: { status: ImportStatus; account: Account }) {
  return (
    <Node marker="●" title="Now" detail={quietLine(status)}>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ImportStalenessBadge accountId={account.id} />
        {status.span && (
          <span>
            rows cover {day(status.span.from)} – {day(status.span.to)}
          </span>
        )}
        {status.cadenceDays !== undefined && (
          <span>· measured every {status.cadenceDays} days</span>
        )}
      </div>
    </Node>
  );
}

function spanLabel(batch: ImportBatch): string | undefined {
  if (!batch.from || !batch.to) return undefined;
  return batch.from === batch.to ? day(batch.from) : `${day(batch.from)} – ${day(batch.to)}`;
}

function BatchNode({ batch, account }: { batch: ImportBatch; account: Account }) {
  const empty = batch.rowCount === 0;
  const span = spanLabel(batch);
  return (
    <Node marker={empty ? '○' : '│'} title={when(batch.at)} muted={empty}>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <ImportSourceBadge kind={batch.kind} format={batch.format} />
        <span className="tabular-nums">
          {empty ? 'nothing new' : `${batch.rowCount.toLocaleString('en-AU')} rows`}
        </span>
        {span && <span className="text-muted-foreground">· {span}</span>}
        {batch.checkpointId && (
          <a
            href={`#/accounts/${account.id}/checkpoints#${batch.checkpointId}`}
            className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            <Flag className="h-3 w-3" />
            minted a checkpoint
          </a>
        )}
      </div>
    </Node>
  );
}

/**
 * Variant `timeline`: status and history are one thing read top-down. The
 * source stays a card on the side, because how an account is fed is a fact
 * about the account, not an event; everything else is events, and "now" is
 * the newest of them. The bet is that staleness is easier to feel as the gap
 * between the first two nodes than as a number in a panel.
 */
function AccountImports({
  account,
  config,
  activity,
}: {
  account: Account;
  config?: ImportConfig;
  activity?: SyncActivity;
}) {
  const status = importStatusFor(account.id);
  const batches = batchesFor(account.id);
  const verb = feedVerb(status.kind);
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        backHref={`#/accounts/${account.id}`}
        icon={<AccountAvatar account={account} size="md" />}
        title={`Imports — ${account.name}`}
        description="What feeds this account, and everything it has done, newest first."
        actions={<ImportActions account={account} config={config} activity={activity} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ol className="border-l pl-0 lg:order-1">
          <NowNode status={status} account={account} />
          {batches.map((batch) => (
            <BatchNode key={batch.id} batch={batch} account={account} />
          ))}
          {batches.length === 0 && (
            <Node marker="○" title={`Never ${verb}ed`} muted>
              <p className="mt-1 text-xs">
                {config
                  ? `The first ${verb} will appear here with what it wrote.`
                  : 'Import a file or set up a source and each batch will be listed here.'}
              </p>
            </Node>
          )}
        </ol>
        <div className="lg:order-2">
          <ImportSourceSection account={account} config={config} />
        </div>
      </div>
    </div>
  );
}

const byId = new Map(accounts.map((a) => [a.id, a]));

function page(id: string, override?: Partial<ImportConfig>, activity?: SyncActivity) {
  return () => {
    const account = byId.get(id);
    if (!account) return <EmptyState title="No such account" />;
    const status = importStatusFor(id);
    const config = status.config ? { ...status.config, ...override } : undefined;
    return <AccountImports account={account} config={config} activity={activity} />;
  };
}

export const states: ScreenStates = {
  'file-csv': page('a2'),
  'file-pdf': page('a3'),
  cash: page('a5'),
  'never-imported': page('a4'),
  'token-missing': page('a13', { connection: 'token-missing' }),
  syncing: page('a13', undefined, { phase: 'running', step: 'Fetching 2 Sep – 6 Sep from Up…' }),
  'sync-result': page('a13', undefined, { phase: 'done', imported: 3, settled: 1, deltaCents: 0 }),
  'sync-mismatch': page('a13', undefined, {
    phase: 'done',
    imported: 3,
    settled: 1,
    deltaCents: -2_200,
  }),
};

export default page('a13');
