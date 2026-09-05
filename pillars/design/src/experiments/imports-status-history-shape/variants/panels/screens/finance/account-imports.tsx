import { accounts } from '@/fixtures/accounts';
import { batchesFor, type ImportConfig } from '@/fixtures/import-sources';
import { feedVerb, importStatusFor } from '@/fixtures/import-status';
import { ImportActions, type SyncActivity } from '@/kit/import-actions';
import { ImportBatchHistory } from '@/kit/import-batch-history';
import { ImportSourceSection } from '@/kit/import-source-section';
import { ImportStatusSection } from '@/kit/import-status-section';
import { AccountAvatar } from '@/screens/finance/account-chip';

import { EmptyState, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Account } from '@/fixtures/accounts';

export const meta: ScreenMeta = { title: 'Account imports', order: 7, frame: 'web' };

/**
 * Variant `panels`: the same four sections as main, but Source and Status
 * share a row so the page is two bands — the standing facts (how it is fed,
 * how fresh it is) above the fold, and the history as a full-width ledger
 * below. The bet is that a reader checks the two panels against each other
 * more often than they scroll the history, so the panels should be visible
 * at once and the history should not push them apart.
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
        description="How this account gets its transactions and when it last did, then every batch that fed it."
        actions={<ImportActions account={account} config={config} activity={activity} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ImportSourceSection account={account} config={config} />
        <ImportStatusSection account={account} status={status} />
      </div>
      <section className="space-y-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          History
        </h2>
        {batches.length > 0 ? (
          <ImportBatchHistory account={account} batches={batches} />
        ) : (
          <EmptyState
            title={`Never ${verb}ed`}
            description={
              config
                ? `Nothing has landed in ${account.name} yet. The first ${verb} will appear here with what it wrote.`
                : `Import a file or set up a source, and every batch that feeds ${account.name} will be listed here.`
            }
          />
        )}
      </section>
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
