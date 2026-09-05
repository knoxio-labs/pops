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
 * An account owns how it gets fed, and this is where that lives (POPS-2918,
 * the POPS-2750 shape: plumbing gets its own page, the account page shows
 * only the result). Four sections, top to bottom in the order a reader asks
 * them: what feeds this, when did it last, what has it done, what can I do.
 * A synced account and a file-fed one differ in wording (sync vs import)
 * and in one action, not in layout — the sameness is the point, so an Up
 * account and an Amex CSV read as the same kind of thing at different speeds.
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
        description="How this account gets its transactions, when it last did, and every batch that fed it. The balance shown elsewhere is the result; this is the plumbing behind it."
        actions={<ImportActions account={account} config={config} activity={activity} />}
      />
      <ImportSourceSection account={account} config={config} />
      <ImportStatusSection account={account} status={status} />
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
  'sync-result': page('a13', undefined, {
    phase: 'done',
    imported: 3,
    settled: 1,
    deltaCents: 0,
  }),
  'sync-mismatch': page('a13', undefined, {
    phase: 'done',
    imported: 3,
    settled: 1,
    deltaCents: -2_200,
  }),
};

export default page('a13');
