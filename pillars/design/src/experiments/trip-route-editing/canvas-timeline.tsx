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
    <div data-timeline-record={record.id} className="flex gap-5">
      <aside
        aria-label="Route date"
        className="relative w-24 shrink-0 border-r border-dotted pr-6 pt-2 text-right text-sm text-muted-foreground sm:w-32"
      >
        <span className="absolute -right-4 top-3 z-10 flex size-8 items-center justify-center rounded-full border bg-background">
          <Icon className="size-4" aria-hidden />
        </span>
        {record.kind === 'city' ? (
          <VisitTiming record={record} />
        ) : (
          when && <p className="py-3">{when}</p>
        )}
      </aside>
      <div className="min-w-0 flex-1">
        <CanvasNode record={record} index={index} datesInRail />
        <MissingTransit from={record.id} index={index} />
      </div>
    </div>
  );
}
