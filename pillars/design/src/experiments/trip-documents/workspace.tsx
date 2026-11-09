import { Plus, Undo2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { DocumentCapture } from './capture';
import { TripDocumentsProvider } from './context';
import { DocumentFilters } from './filters';
import { createTripDocumentsState } from './fixture';
import { documentRows } from './model';
import { DocumentResults } from './results';
import { TripDocumentsReview } from './review';
import { DocumentDialog } from './source';

import type { TripDocumentsScenario } from './fixture';
import type { TripDocumentFilters } from './model';

/** Compare route-associated originals with a document-first ledger using shared local history. */
export function TripDocumentsWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'route' | 'documents';
  scenario?: TripDocumentsScenario;
}) {
  const history = useRouteState(() => createTripDocumentsState(scenario));
  const [adding, setAdding] = useState(false);
  const [filters, setFilters] = useState<TripDocumentFilters>({
    query: '',
    mimeType: '',
    source: 'all',
    offline: 'all',
  });
  return (
    <TripDocumentsProvider state={history.state} change={history.change}>
      <TripDocumentsReview layout={layout} />
      <main className="mx-auto max-w-3xl space-y-5 px-5 py-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Documents</h1>
          <div className="flex gap-1">
            <Button variant="ghost" disabled={!history.canUndo} onClick={history.undo}>
              <Undo2 className="size-4" />
              Undo
            </Button>
            <Button variant="outline" aria-expanded={adding} onClick={() => setAdding(!adding)}>
              <Plus className="size-4" />
              Add documents
            </Button>
          </div>
        </header>
        {adding && <DocumentCapture />}
        <DocumentFilters filters={filters} onChange={setFilters} />
        <DocumentResults layout={layout} rows={documentRows(history.state, filters)} />
      </main>
      <DocumentDialog />
    </TripDocumentsProvider>
  );
}
