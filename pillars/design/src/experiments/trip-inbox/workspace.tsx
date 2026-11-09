import { Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@pops/ui';

import { InboxComposer } from './composer';
import { InboxContext } from './context';
import { InboxFiltersControl } from './filters';
import { inboxRows, inboxSourceRow } from './model';
import { InboxResults } from './results';
import { InboxReview } from './review';
import { useInboxState } from './state';

import type { InboxFilters, InboxScenario } from './model';

/** Share source-preserving capture and organisation actions across inline and dialog proposals. */
export function InboxWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'inline' | 'dialog';
  scenario?: InboxScenario;
}) {
  const history = useInboxState(scenario);
  const [selectedId, select] = useState<string | null>(null);
  const [filters, setFilters] = useState<InboxFilters>({ query: '', organisation: 'all' });
  const context = useMemo(
    () => ({ state: history.state, change: history.change }),
    [history.state, history.change]
  );
  return (
    <InboxContext value={context}>
      <InboxReview layout={layout} />
      <main className="mx-auto max-w-3xl space-y-5 px-5 py-6">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <Button variant="ghost" disabled={!history.canUndo} onClick={history.undo}>
            <Undo2 className="size-4" />
            Undo
          </Button>
        </header>
        <InboxComposer
          draft={history.state.capture.draft}
          change={history.changeDraft}
          capture={history.capture}
        />
        {history.error && (
          <p role="alert" className="text-sm text-destructive">
            {history.error}
          </p>
        )}
        <InboxFiltersControl filters={filters} change={setFilters} />
        <InboxResults
          layout={layout}
          rows={inboxRows(history.state, filters)}
          selected={selectedId ? inboxSourceRow(history.state, selectedId) : null}
          select={select}
        />
      </main>
    </InboxContext>
  );
}
