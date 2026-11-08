import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { formatCityTiming } from '@/fixtures/trip-overview-format';
import { ArrowLeft, ListTree, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { CanvasContext, canvasDragType, useCanvas } from '../trip-route-editing/canvas-context';
import { CanvasFields, VisitTiming } from '../trip-route-editing/canvas-fields';
import { CanvasInsert } from '../trip-route-editing/canvas-insert';
import { CanvasItemGroup } from '../trip-route-editing/canvas-items';
import { canvasName } from '../trip-route-editing/canvas-model';
import { useCanvasActions, useRouteState } from '../trip-route-editing/canvas-state';
import { visitDayDates } from './day-model';
import { VisitDays } from './day-view';
import { visitCanvas } from './fixture';
import { VisitPeriods } from './period-view';
import { VisitReview } from './review';
import { VisitToolbar } from './toolbar';

import type { TripDate, TripRecord } from '@/fixtures/trip-overview-model';

import type { VisitScenario } from './fixture';

/** One editable visit projects into stay periods or calendar days without duplicating source records. */
export function VisitWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'periods' | 'days';
  scenario?: VisitScenario;
}) {
  const route = useRouteState(() => visitCanvas(scenario));
  const actions = useCanvasActions(route.state, route.change, true);
  return (
    <CanvasContext.Provider value={actions}>
      <VisitReview layout={layout} />
      <main
        className="mx-auto max-w-5xl space-y-4 p-4 md:p-6"
        onDragStartCapture={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const card = target.closest('[data-canvas-id], [data-sortable-key]');
          const id =
            card?.getAttribute('data-canvas-id') ?? card?.getAttribute('data-sortable-key');
          if (id) {
            event.dataTransfer.setData(canvasDragType, id);
            actions.setDragged(id);
          }
        }}
        onDragEndCapture={() => {
          actions.setDragged(null);
          actions.setHoverVisit(null);
          actions.previewOrder(null);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost">
            <a target="_top" href="/design/x/trip-route-editing/direct/s/trips/route">
              <ArrowLeft className="size-4" aria-hidden />
              {tripDisplayName(tripMetadata)}
            </a>
          </Button>
          <Button variant="ghost" disabled={!route.canUndo} onClick={route.undo}>
            <RotateCcw className="size-4" aria-hidden />
            Undo
          </Button>
        </div>
        <WorkspaceContent layout={layout} />
      </main>
    </CanvasContext.Provider>
  );
}

function WorkspaceContent({ layout }: { layout: 'periods' | 'days' }) {
  const { state } = useCanvas();
  const [visitId, setVisitId] = useState('recife');
  const [day, setDay] = useState<TripDate | null>(null);
  const visit = state.records.find((r) => r.id === visitId);
  if (!visit) return null;
  const days = visitDayDates(visit, state);
  return (
    <>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CanvasFields record={visit} showTiming={false} />
          </div>
          <VisitSelector
            selected={visitId}
            select={(id) => {
              setVisitId(id);
              setDay(null);
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <CanvasFieldsTiming visit={visit} />
          <CanvasInsert
            label="Add to visit"
            target={{ visitId: visit.id }}
            defaultKind="idea"
            line={false}
          />
        </div>
      </header>
      <VisitToolbar day={day} days={days} setDay={setDay} />
      <VisitProjection visit={visit} layout={layout} day={day} days={days} />
    </>
  );
}

function CanvasFieldsTiming({ visit }: { visit: TripRecord }) {
  return (
    <div className="max-w-60">
      <VisitTiming record={visit} />
    </div>
  );
}

function DaySections({ visit, days }: { visit: TripRecord; days: TripDate[] }) {
  const { state } = useCanvas();
  const undated = state.records.filter(
    (r) => r.visitId === visit.id && ['idea', 'event', 'person'].includes(r.kind) && !r.schedule
  );
  return (
    <div className="space-y-4">
      {days.map((day) => (
        <section key={day} aria-label={day}>
          <h2 className="mb-2 text-sm font-semibold">
            {new Intl.DateTimeFormat('en-AU', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            }).format(new Date(`${day}T00:00:00Z`))}
          </h2>
          <VisitDays visit={visit} day={day} />
        </section>
      ))}
      {undated.length > 0 && (
        <section aria-label="Undated items">
          <h2 className="text-sm font-semibold">Ideas and people</h2>
          <CanvasItemGroup
            visit={visit}
            items={undated}
            containerId={`visit-undated:${visit.id}`}
          />
        </section>
      )}
      <CanvasInsert label="Add to visit" target={{ visitId: visit.id }} defaultKind="idea" />
    </div>
  );
}

function VisitProjection({
  visit,
  layout,
  day,
  days,
}: {
  visit: TripRecord;
  layout: 'periods' | 'days';
  day: TripDate | null;
  days: TripDate[];
}) {
  if (day) return <VisitDays visit={visit} day={day} />;
  return layout === 'periods' ? (
    <VisitPeriods visit={visit} />
  ) : (
    <DaySections visit={visit} days={days} />
  );
}

function VisitSelector({ selected, select }: { selected: string; select: (id: string) => void }) {
  const { state } = useCanvas();
  const [open, setOpen] = useState(false);
  const visits = state.order.flatMap((id) =>
    state.records.filter((r) => r.id === id && r.kind === 'city')
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label="Choose visit">
          <ListTree className="size-4" aria-hidden />
          Visits
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-1">
        {visits.map((visit) => (
          <Button
            key={visit.id}
            variant={selected === visit.id ? 'secondary' : 'ghost'}
            className="w-full justify-between gap-2 whitespace-normal text-left"
            onClick={() => {
              select(visit.id);
              setOpen(false);
            }}
          >
            <span>{canvasName(state, visit)}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {formatCityTiming(visit.timing ?? {})}
            </span>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
