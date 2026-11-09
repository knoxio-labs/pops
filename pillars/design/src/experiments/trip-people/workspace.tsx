import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { AddTripPerson } from './add-person';
import { TripPeopleContext } from './context';
import { TripPeopleFilters } from './filters';
import { createTripPeopleState } from './fixtures';
import { peopleRows } from './model';
import { TripPeopleResults } from './results';
import { TripPeopleReview } from './review';

import type { PeopleFilters, PeopleScenario } from './model';

/** Links existing people and edits only trip meeting plans across two shared-data grouping proposals. */
export function TripPeopleWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'route' | 'people';
  scenario?: PeopleScenario;
}) {
  const history = useRouteState(() => createTripPeopleState(scenario));
  const { state, change } = history;
  const context = useMemo(() => ({ state, change }), [state, change]);
  const [filters, setFilters] = useState<PeopleFilters>({
    query: '',
    intention: '',
    agreement: '',
    visitId: '',
  });
  return (
    <TripPeopleContext.Provider value={context}>
      <TripPeopleReview layout={layout} />
      <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">People</h1>
          <div className="flex items-center gap-2">
            {history.canUndo && (
              <Button variant="ghost" onClick={history.undo}>
                <RotateCcw className="size-4" aria-hidden />
                Undo
              </Button>
            )}
            <AddTripPerson />
          </div>
        </header>
        <TripPeopleFilters filters={filters} change={setFilters} />
        <TripPeopleResults state={state} rows={peopleRows(state, filters)} layout={layout} />
      </main>
    </TripPeopleContext.Provider>
  );
}
