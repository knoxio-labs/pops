import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { ArrangementsContext } from './context';
import { ArrangementCoverage } from './coverage-panel';
import { ArrangementFilterBar } from './filters';
import { createArrangementState } from './fixture';
import { visibleArrangements } from './model';
import { ArrangementResults } from './results';
import { ArrangementsReview } from './review';

import type { ArrangementFilters, ArrangementScenario } from './model';

/** Compares route and kind groupings with the same arrangements, source dialogs and coverage issues. */
export function ArrangementsWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'route' | 'kinds';
  scenario?: ArrangementScenario;
}) {
  const history = useRouteState(() => createArrangementState(scenario));
  const { state, change: changeState } = history;
  const context = useMemo(() => ({ state, change: changeState }), [state, changeState]);
  const [filters, change] = useState<ArrangementFilters>({ query: '', kind: '', purchase: 'all' });
  const rows = visibleArrangements(state, filters);
  return (
    <ArrangementsContext.Provider value={context}>
      <ArrangementsReview layout={layout} />
      <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Arrangements</h1>
          {history.canUndo && (
            <Button variant="ghost" onClick={history.undo}>
              <RotateCcw className="size-4" aria-hidden />
              Undo
            </Button>
          )}
        </header>
        <ArrangementCoverage state={state} />
        <ArrangementFilterBar filters={filters} change={change} />
        <ArrangementResults state={state} rows={rows} layout={layout} />
      </main>
    </ArrangementsContext.Provider>
  );
}
