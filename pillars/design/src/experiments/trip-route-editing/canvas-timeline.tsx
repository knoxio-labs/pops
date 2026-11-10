import { presentTripRecord } from '@/fixtures/trip-overview-format';
import { BedDouble, GitBranch, MapPin, Plane, Ticket } from 'lucide-react';

import { useCanvas } from './canvas-context';
import { VisitTiming } from './canvas-fields';
import { CanvasNode } from './canvas-node';
import { MissingTransit } from './canvas-transit';

import type { TripRecord } from '@/fixtures/trip-overview-model';

const markers = {
  city: MapPin,
  transport: Plane,
  stay: BedDouble,
  event: Ticket,
  gap: GitBranch,
  person: MapPin,
  idea: MapPin,
};

/** Dates and icon markers form one continuous rail beside the route's primary cards. */
export function RouteTimelineItem({ record, index }: { record: TripRecord; index: number }) {
  const { state } = useCanvas();
  const Icon = markers[record.kind];
  const when = presentTripRecord(record, state.records).when;
  return (
    <div
      data-timeline-record={record.id}
      className="group/route flex flex-col gap-1 sm:flex-row sm:gap-4"
    >
      <aside
        aria-label="Route date"
        className="relative w-full shrink-0 border-l border-dotted border-border pl-6 text-left text-sm text-foreground sm:w-32 sm:border-l-0 sm:border-r sm:pl-0 sm:pr-6 sm:pt-2 sm:text-right"
      >
        <span className="absolute -left-4 top-3 sm:left-auto sm:-right-4 z-10 flex size-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        {record.kind === 'city' ? (
          <VisitTiming record={record} />
        ) : (
          when && <p className="py-3 font-medium">{when}</p>
        )}
      </aside>
      <div className="min-w-0 flex-1 border-l border-dotted border-border pl-3 sm:border-0 sm:pl-0">
        <CanvasNode record={record} index={index} datesInRail />
        <MissingTransit from={record.id} index={index} />
      </div>
    </div>
  );
}
