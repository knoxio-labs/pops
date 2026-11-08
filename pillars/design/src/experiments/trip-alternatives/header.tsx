import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { ArrowLeft, GitBranch, RotateCcw } from 'lucide-react';

import { Button } from '@pops/ui';

import { canvasName } from '../trip-route-editing/canvas-model';
import { previewVisits } from './model';

import type { AlternativesState } from './model';

/** Keep the working route distinct from candidate previews. */
export function AlternativesHeader({
  state,
  canUndo,
  undo,
}: {
  state: AlternativesState;
  canUndo: boolean;
  undo: () => void;
}) {
  return (
    <>
      {' '}
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" className="px-0">
            <a target="_top" href="/design/x/trip-route-editing/direct/s/trips/route">
              <ArrowLeft className="size-4" aria-hidden />
              {tripDisplayName(tripMetadata)}
            </a>
          </Button>
          <Button variant="ghost" disabled={!canUndo} onClick={undo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        </div>
        <h1 className="text-2xl font-bold">Alternatives</h1>
        <p className="text-sm text-foreground/80">
          {previewVisits(state)
            .map((visit) => canvasName(state.canvas, visit))
            .join(' → ')}
        </p>
      </header>
      <section
        aria-label="Working route"
        className="rounded-xl border border-foreground/25 bg-muted/60 p-3"
      >
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <GitBranch className="size-4 text-app-accent" aria-hidden />
          Working route
        </h2>
        <p className="text-base font-medium">
          {previewVisits(state, state.workingId)
            .map((visit) => canvasName(state.canvas, visit))
            .join(' → ')}
        </p>
      </section>
    </>
  );
}
