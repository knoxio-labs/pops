import { tripDisplayName, tripMetadata } from '@/fixtures/trip-metadata';
import { isPurchasedArrangement } from '@/fixtures/trip-overview-model';
import { ArrowLeft, Clock, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';

import { Button, TextInput, cn } from '@pops/ui';

import { CanvasContext, useCanvas } from '../trip-route-editing/canvas-context';
import { useCanvasActions, useRouteState } from '../trip-route-editing/canvas-state';
import { EventFields } from './event-fields';
import { initialEventWorkspace } from './fixture';
import { EventRouteImpact } from './impact-view';
import { EventDetailsContext, useEventDetails } from './model';
import { EventReferences } from './references';
import { EventReview } from './review';
import { EventRouteContext } from './route-context';
import { EventTickets } from './tickets';

import type { EventScenario } from './fixture';

/** Source fields and route operations share an undo history; every mutation is local to the prototype. */
export function EventWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'details' | 'route';
  scenario?: EventScenario;
}) {
  const history = useRouteState(() => initialEventWorkspace(scenario));
  const { state: data, change } = history;
  const canvas = useCanvasActions(data.canvas, (next) => change({ ...data, canvas: next }), true);
  const detailsActions = useMemo(() => ({ data, change }), [data, change]);
  return (
    <EventDetailsContext.Provider value={detailsActions}>
      <CanvasContext.Provider value={canvas}>
        <EventReview layout={layout} />
        <main className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
          <div className="flex items-center justify-between gap-2">
            <Button asChild variant="ghost">
              <a target="_top" href="/design/x/trip-route-editing/direct/s/trips/route">
                <ArrowLeft className="size-4" aria-hidden />
                {tripDisplayName(tripMetadata)}
              </a>
            </Button>
            <Button variant="ghost" disabled={!history.canUndo} onClick={history.undo}>
              <RotateCcw className="size-4" aria-hidden />
              Undo
            </Button>
          </div>
          <EventContent layout={layout} />
        </main>
      </CanvasContext.Provider>
    </EventDetailsContext.Provider>
  );
}

function EventContent({ layout }: { layout: 'details' | 'route' }) {
  const { state } = useCanvas();
  const { data } = useEventDetails();
  const event = state.records.find((r) => r.id === data.eventId);
  if (!event) return null;
  const card = (
    <article
      aria-label="Event details"
      className={cn(
        'space-y-3 rounded-xl border border-foreground/25 bg-muted/60 p-3 shadow-sm',
        isPurchasedArrangement(event) ? 'border-l-4 border-l-app-accent' : 'border-dashed'
      )}
    >
      <EventFields event={event} />
      <EventClockSummary />
      <EventReferences />
      <EventTickets event={event} />
      <EventNotes />
    </article>
  );
  return (
    <>
      {layout === 'route' ? <EventRouteContext event={event}>{card}</EventRouteContext> : card}
      <EventRouteImpact event={event} />
    </>
  );
}

function EventClockSummary() {
  const { data } = useEventDetails();
  const { startTime, endTime, timeZone } = data.metadata;
  if (!startTime && !endTime) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-foreground/90">
      <Clock className="size-4 text-app-accent" aria-hidden />
      {startTime}
      {startTime && endTime && ' → '}
      {endTime}
      {timeZone && ` · ${timeZone}`}
    </p>
  );
}

function EventNotes() {
  const { state, change } = useCanvas();
  const { data } = useEventDetails();
  const event = state.records.find((r) => r.id === data.eventId);
  if (!event) return null;
  return (
    <TextInput
      aria-label="Event notes"
      placeholder="Add note"
      variant="ghost"
      key={`${event.id}:${event.notes}`}
      defaultValue={event.notes}
      containerClassName="bg-transparent px-0"
      onBlur={(e) => {
        if (e.currentTarget.value !== event.notes)
          change({
            ...state,
            records: state.records.map((r) =>
              r.id === event.id ? { ...r, notes: e.currentTarget.value } : r
            ),
          });
      }}
    />
  );
}
