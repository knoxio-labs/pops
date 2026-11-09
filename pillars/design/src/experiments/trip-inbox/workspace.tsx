import { Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { InboxComposer } from './composer';
import { InboxContext } from './context';
import { InboxFiltersControl } from './filters';
import { createInboxState } from './fixture';
import { captureInboxItem, inboxRows, inboxSourceRow } from './model';
import { InboxResults } from './results';
import { InboxReview } from './review';

import type { InboxFilters, InboxScenario } from './model';

/** Share source-preserving capture and organisation actions across inline and dialog proposals. */
export function InboxWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'inline' | 'dialog';
  scenario?: InboxScenario;
}) {
  const history = useRouteState(() => createInboxState(scenario));
  const [draft, setDraft] = useState(history.state.capture.draft);
  const [selectedId, select] = useState<string | null>(null);
  const [filters, setFilters] = useState<InboxFilters>({ query: '', organisation: 'all' });
  const [error, setError] = useState<string | null>(null);
  const context = useMemo(
    () => ({ state: history.state, change: history.change }),
    [history.state, history.change]
  );
  function capture() {
    const result = captureInboxItem(
      { ...history.state, capture: { ...history.state.capture, draft } },
      crypto.randomUUID()
    );
    setError(result.error);
    if (!result.error) {
      history.change(result.state);
      setDraft(result.state.capture.draft);
    }
  }
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
        <InboxComposer draft={draft} change={setDraft} capture={capture} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
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
