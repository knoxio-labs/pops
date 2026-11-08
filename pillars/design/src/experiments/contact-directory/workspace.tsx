import { Undo2 } from 'lucide-react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { DirectoryContext } from './context';
import { DirectoryCreate } from './create';
import { DirectoryFilters } from './filters';
import { initialDirectory } from './fixture';
import { DirectoryResults } from './results';
import { DirectoryReview } from './review';

import type { DirectoryScenario } from './fixture';

/** Explore one reusable contacts directory while keeping details and creation in context. */
export function DirectoryWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'combined' | 'grouped';
  scenario?: DirectoryScenario;
}) {
  const history = useRouteState(() => initialDirectory(scenario));
  return (
    <DirectoryContext value={{ state: history.state, change: history.change }}>
      <DirectoryReview layout={layout} />
      <main className="mx-auto max-w-4xl space-y-5 px-5 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={history.undo} disabled={!history.canUndo}>
              <Undo2 className="size-4" />
              Undo
            </Button>
            <DirectoryCreate />
          </div>
        </header>
        <DirectoryFilters />
        <DirectoryResults layout={layout} />
      </main>
    </DirectoryContext>
  );
}
