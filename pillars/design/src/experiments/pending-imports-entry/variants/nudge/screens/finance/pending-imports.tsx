import { type PendingImport, pendingSets } from '@/fixtures/pending-imports';
import { PendingImportList } from '@/kit/pending-import-card';
import { History, Plus } from 'lucide-react';

import { Button, EmptyState, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Pending imports', order: 8, frame: 'web' };

/**
 * Every import that was started and not committed, on one page the dashboard
 * nudge and the wizard's first step both point at. Unusable ones first, so
 * the deploy leftovers get discarded before anything else is opened; then
 * the one open elsewhere, the live ones, the saved drafts.
 */
function Page({ items }: { items: PendingImport[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        backHref="#/dashboard"
        title="Pending imports"
        description="Started and not finished, by you, or by a bank feed while you were away. Nothing here is in the ledger yet."
        actions={
          <Button variant="outline" prefix={<Plus className="h-4 w-4" />}>
            New import
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing pending"
          description="Every import you started has been committed or discarded. A live feed will show up here the moment it has rows to review."
          action={<Button prefix={<Plus className="h-4 w-4" />}>Start an import</Button>}
        />
      ) : (
        <PendingImportList items={items} />
      )}
    </div>
  );
}

export default function PendingImports() {
  return <Page items={pendingSets.mixed} />;
}

export const states: ScreenStates = {
  empty: () => <Page items={pendingSets.none} />,
  'unusable-after-deploy': () => <Page items={pendingSets.withUnusable} />,
  'open-in-another-tab': () => <Page items={pendingSets.openElsewhere} />,
};
