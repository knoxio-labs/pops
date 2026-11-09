import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { ExploreCapture } from './capture';
import { ExploreContext } from './context';
import { ExploreFilterBar } from './filters';
import { createExploreState } from './fixture';
import { visibleExploreRecords } from './model';
import { ExploreResults } from './results';
import { ExploreReview } from './review';

import type { ExploreScenario } from './fixture';
import type { ExploreFilters } from './model';

/** Collects undated source possibilities with shared capture, filtering and source editing. */
export function ExploreWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'collection' | 'cities';
  scenario?: ExploreScenario;
}) {
  const history = useRouteState(() => createExploreState(scenario));
  const { state, change } = history;
  const context = useMemo(() => ({ state, change }), [state, change]);
  const [filters, setFilters] = useState<ExploreFilters>({
    query: '',
    kind: '',
    cityId: '',
    status: '',
    purpose: '',
  });
  const records = visibleExploreRecords(state, filters);
  return (
    <ExploreContext.Provider value={context}>
      <ExploreReview layout={layout} />
      <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Explore</h1>
          <Button variant="ghost" disabled={!history.canUndo} onClick={history.undo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        </header>
        <ExploreCapture />
        <ExploreFilterBar filters={filters} change={setFilters} />
        <ExploreResults records={records} layout={layout} />
      </main>
    </ExploreContext.Provider>
  );
}
