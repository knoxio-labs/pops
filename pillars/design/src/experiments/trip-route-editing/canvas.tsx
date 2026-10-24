import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { RotateCcw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button, SortableGrid } from '@pops/ui';

import { flightWindow, timingFindings } from './calendar-model';
import { CalendarView } from './calendar-view';
import { captureCard, moveCard, reorderCards } from './canvas-actions';
import { canvasCalendar, canvasTimingRules } from './canvas-calendar';
import { CanvasContext, canvasDragType, useCanvas } from './canvas-context';
import { CanvasInsert } from './canvas-insert';
import { initialCanvas } from './canvas-model';
import { RentalSections } from './canvas-rentals';
import { RouteTimelineItem } from './canvas-timeline';
import { CanvasToolbar } from './canvas-toolbar';
import { PlannerReview } from './review';

import type { CanvasState } from './canvas-model';
import type { CanvasScale } from './canvas-toolbar';
import type { PlannerScenario } from './model';

/** One editable source graph projects into city, booking, day-range and flight-window views. */
export function PlannerCanvas({ scenario = 'default' }: { scenario?: PlannerScenario }) {
  const route = useRouteState(scenario);
  const { state, change } = route;
  const [scale, setScale] = useState<CanvasScale>('bookings');
  const [range, setRange] = useState(() => initialRange(state));
  const actions = useCanvasActions(state, change, scale !== 'cities');
  return (
    <CanvasContext.Provider value={actions}>
      <PlannerReview layout="direct" />
      <main
        className="mx-auto max-w-5xl space-y-4 p-5 md:p-8"
        onDragStartCapture={(e) => {
          const target = e.target;
          if (!(target instanceof Element)) return;
          const card = target.closest('[data-canvas-id], [data-sortable-key]');
          const id =
            card?.getAttribute('data-canvas-id') ?? card?.getAttribute('data-sortable-key');
          if (id) {
            e.dataTransfer.setData(canvasDragType, id);
            actions.setDragged(id);
          }
        }}
        onDragEndCapture={() => {
          actions.setDragged(null);
          actions.setHoverVisit(null);
          actions.previewOrder(null);
        }}
      >
        <CanvasHeader canUndo={route.canUndo} undo={route.undo} />
        <CanvasToolbar scale={scale} setScale={setScale} range={range} setRange={setRange} />
        <CanvasProjection scale={scale} from={range.start} to={range.end} />
      </main>
    </CanvasContext.Provider>
  );
}

function useCanvasActions(
  state: CanvasState,
  change: (next: CanvasState) => void,
  showDetails: boolean
) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [hoverVisit, setHoverVisit] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const preview = useMemo(
    () => (previewOrder ? { ...state, order: previewOrder } : state),
    [state, previewOrder]
  );
  const actions = useMemo(
    () => ({
      state,
      preview,
      showDetails,
      change,
      dragged,
      setDragged,
      hoverVisit,
      setHoverVisit,
      previewOrder: setPreviewOrder,
      add: (
        kind: Parameters<typeof captureCard>[1],
        title: string,
        target: Parameters<typeof captureCard>[3]
      ) => change(captureCard(state, kind, title, target)),
      move: (id: string, target: Parameters<typeof moveCard>[2]) => {
        change(moveCard(state, id, target));
        setDragged(null);
        setHoverVisit(null);
        setPreviewOrder(null);
      },
    }),
    [state, preview, showDetails, change, dragged, hoverVisit]
  );
  return actions;
}

function initialRange(state: CanvasState) {
  const bookings = canvasCalendar(state);
  const flight = bookings.find((booking) => booking.kind === 'flight');
  if (!flight) return { start: '', end: '' };
  const window = flightWindow(bookings, flight.recordId);
  return { start: window.from, end: window.to };
}

function CanvasProjection({ scale, from, to }: { scale: CanvasScale; from: string; to: string }) {
  const { state } = useCanvas();
  const bookings = useMemo(() => canvasCalendar(state), [state]);
  const findings = useMemo(
    () => timingFindings(bookings, canvasTimingRules(state)),
    [bookings, state]
  );
  return scale === 'cities' || scale === 'bookings' ? (
    <RouteCards />
  ) : (
    <CalendarView bookings={bookings} findings={findings} from={from} to={to} scale={scale} />
  );
}

function CanvasHeader({ canUndo, undo }: { canUndo: boolean; undo: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">{tripDisplayName(tripMetadata)}</p>
        <h1 className="text-3xl font-bold">Route planner</h1>
      </div>
      <Button variant="ghost" disabled={!canUndo} onClick={undo}>
        <RotateCcw className="size-4" aria-hidden />
        Undo
      </Button>
    </header>
  );
}

function useRouteState(scenario: PlannerScenario) {
  const [route, setRoute] = useState<{ state: CanvasState; history: CanvasState[] }>(() => ({
    state: initialCanvas(scenario),
    history: [],
  }));
  const change = useCallback((next: CanvasState) => {
    setRoute((previous) =>
      next === previous.state
        ? previous
        : { state: next, history: [...previous.history, previous.state] }
    );
  }, []);
  const undo = useCallback(() => {
    setRoute((previous) => {
      const state = previous.history.at(-1);
      return state ? { state, history: previous.history.slice(0, -1) } : previous;
    });
  }, []);
  return { state: route.state, change, undo, canUndo: route.history.length > 0 };
}

function RouteCards() {
  const canvas = useCanvas();
  const { state, change } = canvas;
  const records = state.order.flatMap((id) => state.records.filter((r) => r.id === id));
  return (
    <div>
      <RentalSections visitId="" />
      <CanvasInsert label="Insert at start" target={{}} />
      <SortableGrid
        items={records}
        getKey={(r) => r.id}
        columnsClassName="grid-cols-1"
        className="gap-0"
        onPreviewOrderChange={(items) => canvas.previewOrder(items ? items.map((r) => r.id) : null)}
        onReorder={(next) =>
          change(
            reorderCards(
              state,
              next.map((r) => r.id)
            )
          )
        }
        renderItem={(record, index) => <RouteTimelineItem record={record} index={index} />}
      />
    </div>
  );
}
