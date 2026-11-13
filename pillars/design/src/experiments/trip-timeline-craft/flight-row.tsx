import { formatTripDate } from '@/fixtures/trip-overview-format';
import { tripPlaceName } from '@/fixtures/trip-places';
import { ChevronRight, Plane, PlaneLanding, PlaneTakeoff } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { ArrangementMark, RailRow } from './row-primitives';

import type { CraftEndpoint, CraftFlight } from '@/fixtures/trip-timeline-craft';

import type { CraftRowActions } from './model';

function Endpoint({ endpoint, arrival }: { endpoint: CraftEndpoint; arrival?: boolean }) {
  const Icon = arrival ? PlaneLanding : PlaneTakeoff;
  return (
    <div className="min-w-0 flex-1 basis-40">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden />
        {arrival ? 'Arrive' : 'Depart'}
      </div>
      <p className="break-words text-lg font-semibold leading-snug">
        {tripPlaceName(endpoint.placeId)}
      </p>
      <p className="mt-1 text-sm">
        {endpoint.date ? formatTripDate(endpoint.date) : 'Date not set'}
      </p>
      <p className="mt-1 break-words text-sm tabular-nums text-muted-foreground">
        {endpoint.localTime ?? 'Time not set'}
      </p>
      {(endpoint.timeZone || endpoint.localTime) && (
        <p className="mt-1 break-words text-xs text-muted-foreground">
          {endpoint.timeZone ?? 'Timezone not set'}
        </p>
      )}
    </div>
  );
}

/** One journey has one hierarchy and two endpoints; it never repeats a generic Flight heading. */
export function CraftFlightRow({
  flight,
  onOpen,
}: {
  flight: CraftFlight;
  onOpen: CraftRowActions['onOpen'];
}) {
  return (
    <RailRow
      date={flight.departure.date ? formatTripDate(flight.departure.date) : 'Date not set'}
      icon={<Plane className="size-4" aria-label="Flight" />}
    >
      <article
        className={cn(
          'min-w-0 rounded-xl',
          flight.state === 'Purchased' && 'border border-border bg-card p-4 sm:p-5'
        )}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {[flight.carrier, flight.service].filter(Boolean).join(' · ') ||
              'Flight details not supplied'}
          </span>
          <ArrangementMark state={flight.state} />
        </div>
        <div className="flex flex-wrap items-start gap-4 sm:gap-8">
          <Endpoint endpoint={flight.departure} />
          <Endpoint endpoint={flight.arrival} arrival />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 text-sm">
          {flight.handledBy && (
            <p className="text-muted-foreground">Handled by {flight.handledBy}</p>
          )}
          <Button
            variant="ghost"
            className="ml-auto min-h-11 gap-1 px-0 text-sm"
            onClick={() => onOpen(flight)}
          >
            Flight details <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </article>
    </RailRow>
  );
}
