import { Button } from '@pops/ui';

import { captureCard } from '../trip-route-editing/canvas-actions';
import { canvasName } from '../trip-route-editing/canvas-model';
import { AddCity } from './add-city';
import { AlternativeFindings } from './findings';
import { applyAlternative, previewVisits } from './model';
import { AlternativeTimeline } from './timeline';

import type { CanvasState, RouteSection } from '../trip-route-editing/canvas-model';
import type { AlternativesState } from './model';

/** Preview changes before applying route membership; editing never changes purchases. */
export function Comparison({
  state,
  preview,
  change,
  changeCanvas,
  showTimeline = true,
}: {
  state: AlternativesState;
  preview: RouteSection;
  change: (state: AlternativesState) => void;
  changeCanvas: (canvas: CanvasState) => void;
  showTimeline?: boolean;
}) {
  const visits = previewVisits(state, preview.id);
  const missing = preview.cards.some((id) => !visits.some((visit) => visit.id === id));
  return (
    <section aria-label={`Compare ${preview.title}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{preview.title}</h2>
        <Button
          disabled={missing || !preview.cards.length || preview.id === state.workingId}
          onClick={() => change(applyAlternative(state, preview.id))}
        >
          {preview.id === state.workingId ? 'In route' : 'Use path'}
        </Button>
      </div>
      <MembershipChanges state={state} sectionId={preview.id} />
      <AlternativeFindings state={state} sectionId={preview.id} />
      <details open={showTimeline}>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Edit path</summary>
        <AlternativeTimeline
          canvas={state.canvas}
          visits={visits}
          editableIds={preview.cards}
          change={changeCanvas}
        />
        <AddCity
          label="City or region"
          action="Add city"
          add={(name) =>
            changeCanvas(
              captureCard(state.canvas, 'city', name, {
                sectionId: preview.id,
                after: preview.cards.at(-1),
              })
            )
          }
        />
      </details>
    </section>
  );
}

function MembershipChanges({ state, sectionId }: { state: AlternativesState; sectionId: string }) {
  const visits = previewVisits(state, sectionId);
  const current = previewVisits(state, state.workingId);
  const added = visits.filter((visit) => !current.some((item) => item.id === visit.id));
  const removed = current.filter((visit) => !visits.some((item) => item.id === visit.id));
  return (
    <>
      {(added.length > 0 || removed.length > 0) && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-background/50 p-3 text-sm">
          {removed.length > 0 && (
            <div>
              <dt className="text-xs text-foreground/70">Remove from route</dt>
              <dd>{removed.map((visit) => canvasName(state.canvas, visit)).join(' → ')}</dd>
            </div>
          )}
          {added.length > 0 && (
            <div>
              <dt className="text-xs text-foreground/70">Add to route</dt>
              <dd>{added.map((visit) => canvasName(state.canvas, visit)).join(' → ')}</dd>
            </div>
          )}
        </dl>
      )}
    </>
  );
}
