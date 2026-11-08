import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { CaptureComposer } from './composer';
import { initialCapture } from './fixture';
import { CaptureItems } from './items';
import { captureItem } from './model';
import { CaptureReview } from './review';

import type { CaptureScenario } from './fixture';

/** Network-free capture with preserved source records and an independent in-progress draft. */
export function CaptureWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'text' | 'type';
  scenario?: CaptureScenario;
}) {
  const [initial] = useState(() => initialCapture(scenario));
  const [draft, setDraft] = useState(initial.draft);
  const history = useRouteState(() => ({ items: initial.items }));
  function capture() {
    const next = captureItem({ draft, items: history.state.items }, crypto.randomUUID());
    if (next.items === history.state.items) return;
    history.change({ items: next.items });
    setDraft(next.draft);
  }
  return (
    <>
      <CaptureReview layout={layout} />
      <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Button asChild variant="ghost" className="px-0">
              <a target="_top" href="/design/x/trip-route-editing/direct/s/trips/route">
                <ArrowLeft className="size-4" aria-hidden />
                {tripDisplayName(tripMetadata)}
              </a>
            </Button>
            <h1 className="text-2xl font-bold">Quick capture</h1>
          </div>
          <Button variant="ghost" disabled={!history.canUndo} onClick={history.undo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        </header>
        <CaptureComposer layout={layout} draft={draft} change={setDraft} capture={capture} />
        <CaptureItems items={history.state.items} change={(items) => history.change({ items })} />
      </main>
    </>
  );
}
