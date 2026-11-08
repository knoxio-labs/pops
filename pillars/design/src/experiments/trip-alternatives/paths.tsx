import { Check } from 'lucide-react';

import { Badge, Button, cn } from '@pops/ui';

import { canvasName } from '../trip-route-editing/canvas-model';
import { Comparison } from './comparison';
import { previewVisits } from './model';
import { AlternativeTimeline } from './timeline';

import type { CanvasState, RouteSection } from '../trip-route-editing/canvas-model';
import type { AlternativesState } from './model';

/** Comparable path cards use identical source records in both presentation variants. */
export function AlternativePath({
  state,
  section,
  layout,
  previewId,
  select,
  change,
  changeCanvas,
}: {
  state: AlternativesState;
  section: RouteSection;
  layout: 'paths' | 'changes';
  previewId?: string;
  select: (id: string) => void;
  change: (state: AlternativesState) => void;
  changeCanvas: (canvas: CanvasState) => void;
}) {
  return (
    <article
      aria-label={section.title}
      className={cn(
        'rounded-xl border border-dashed border-foreground/30 bg-muted/60 p-3 shadow-sm',
        section.id === previewId && 'border-app-accent ring-1 ring-app-accent/40'
      )}
    >
      <PathHeader
        section={section}
        working={section.id === state.workingId}
        selected={section.id === previewId}
        select={select}
      />
      {layout === 'paths' ? (
        <AlternativeTimeline canvas={state.canvas} visits={previewVisits(state, section.id)} />
      ) : (
        <p className="py-2 text-sm text-foreground/80">
          {section.cards
            .map((id) => {
              const record = state.canvas.records.find((item) => item.id === id);
              return record ? canvasName(state.canvas, record) : 'Visit unavailable';
            })
            .join(' → ')}
        </p>
      )}
      {layout === 'paths' && section.id === previewId && (
        <div className="mt-3 border-t border-foreground/20 pt-3">
          <Comparison
            state={state}
            preview={section}
            change={change}
            changeCanvas={changeCanvas}
            showTimeline={false}
          />
        </div>
      )}
    </article>
  );
}

function PathHeader({
  section,
  working,
  selected,
  select,
}: {
  section: RouteSection;
  working: boolean;
  selected: boolean;
  select: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{section.title}</h2>
      <div className="flex items-center gap-2">
        {working && (
          <Badge variant="secondary">
            <Check className="mr-1 size-3" aria-hidden />
            In route
          </Badge>
        )}
        <Button
          variant={selected ? 'secondary' : 'ghost'}
          aria-pressed={selected}
          aria-label={`Preview ${section.title}`}
          onClick={() => select(section.id)}
        >
          Preview
        </Button>
      </div>
    </div>
  );
}

/** Switch candidates without changing route membership or leaving the current comparison. */
export function PathPicker({
  state,
  previewId,
  select,
}: {
  state: AlternativesState;
  previewId?: string;
  select: (id: string) => void;
}) {
  return (
    <div role="group" aria-label="Preview path" className="flex flex-wrap gap-2">
      {state.canvas.sections.map((section) => (
        <Button
          key={section.id}
          variant={section.id === previewId ? 'secondary' : 'outline'}
          aria-pressed={section.id === previewId}
          aria-label={`Preview ${section.title}`}
          onClick={() => select(section.id)}
        >
          {section.title}
        </Button>
      ))}
    </div>
  );
}
