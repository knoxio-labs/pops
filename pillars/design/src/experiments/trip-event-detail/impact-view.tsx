import { formatCityTiming, formatTripDate } from '@/fixtures/trip-overview-format';
import { MapPin, TriangleAlert } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, Select } from '@pops/ui';

import { useCanvas } from '../trip-route-editing/canvas-context';
import { validCanvasTarget } from '../trip-route-editing/canvas-graph';
import { CanvasInsert } from '../trip-route-editing/canvas-insert';
import { canvasName } from '../trip-route-editing/canvas-model';
import { TransitCard } from '../trip-route-editing/canvas-transit';
import { eventRouteImpact, eventVisitPlacement } from './impact';
import { EventCityInsertion } from './impact-placement';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Edit explicit event membership and route placement; dates and purchased arrangements stay independent. */
export function EventRouteImpact({ event }: { event: TripRecord }) {
  const canvas = useCanvas();
  const { state } = canvas;
  const impact = eventRouteImpact(state, event);
  return (
    <section aria-label="Route impact" className="space-y-4 border-t pt-5">
      <h2 className="text-base font-semibold">Route impact</h2>
      <EventVisit event={event} />
      {impact.findings.map((finding) => (
        <p key={finding} className="flex gap-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {finding}
        </p>
      ))}
      {impact.visit && impact.placement !== 'Working route' && (
        <EventCityInsertion key={impact.visit.id} visit={impact.visit} />
      )}
      {impact.visit &&
        validCanvasTarget(state, { visitId: impact.visit.id }) &&
        impact.gaps.length > 0 && (
          <div className="space-y-2 border-l pl-4">
            {impact.gaps.map((period) => (
              <div key={period.id} className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {period.start && formatTripDate(period.start)} →{' '}
                  {period.end && formatTripDate(period.end)}
                </p>
                <CanvasInsert
                  target={{ visitId: impact.visit?.id, start: period.start, end: period.end }}
                  defaultKind="stay"
                  label="Add accommodation"
                  slotLabel="Accommodation"
                />
              </div>
            ))}
          </div>
        )}
      <EventTransport event={event} />
    </section>
  );
}

function EventTransport({ event }: { event: TripRecord }) {
  const { state } = useCanvas();
  const impact = eventRouteImpact(state, event);
  return (
    <>
      {impact.incomingMissingFrom && (
        <CanvasInsert
          target={{ after: impact.incomingMissingFrom }}
          defaultKind="transport"
          label="Add arrival transport"
          slotLabel="Transport"
        />
      )}
      {impact.transport.map((record) => (
        <TransitCard key={record.id} record={record} />
      ))}
      {impact.visit && impact.missingTransport && (
        <CanvasInsert
          target={{ after: impact.visit.id }}
          defaultKind="transport"
          label="Add onward transport"
          slotLabel="Transport"
        />
      )}
    </>
  );
}

function EventVisit({ event }: { event: TripRecord }) {
  const canvas = useCanvas();
  const { state } = canvas;
  const impact = eventRouteImpact(state, event);
  const visits = state.records.filter((record) => record.kind === 'city');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label="Choose associated visit"
          className="min-h-11 h-auto justify-start gap-3 px-0 text-left"
        >
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {impact.visit ? (
            <span className="space-y-1">
              <span className="block font-medium">{canvasName(state, impact.visit)}</span>
              <span className="block text-sm font-normal text-muted-foreground">
                {[impact.placement, formatCityTiming(impact.visit.timing ?? {})]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          ) : (
            'Add city visit'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <Select
          label="Associated city visit"
          value={event.visitId ?? ''}
          placeholder="Choose city visit"
          className="min-h-11"
          options={visits.map((visit) => ({
            value: visit.id,
            label: `${canvasName(state, visit)} · ${eventVisitPlacement(state, visit.id)}`,
            disabled: !validCanvasTarget(state, { visitId: visit.id }),
          }))}
          onChange={(change) => canvas.move(event.id, { visitId: change.target.value })}
        />
      </PopoverContent>
    </Popover>
  );
}
