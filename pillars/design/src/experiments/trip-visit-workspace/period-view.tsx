import { formatTripDate } from '@/fixtures/trip-overview-format';
import { BedDouble, CarFront, Lightbulb, Plane } from 'lucide-react';

import { AccommodationPeriodView } from '../trip-route-editing/accommodation-view';
import { canvasCalendar } from '../trip-route-editing/canvas-calendar';
import { useCanvas } from '../trip-route-editing/canvas-context';
import { CanvasInsert } from '../trip-route-editing/canvas-insert';
import { RentalSections } from '../trip-route-editing/canvas-rentals';
import { TransitCard } from '../trip-route-editing/canvas-transit';
import { localDateTime } from '../trip-route-editing/canvas-zoned-time';
import { isTripDate } from '../trip-route-editing/lodging-periods';
import {
  accommodationPeriods,
  keyedAccommodationPeriods,
} from '../trip-route-editing/lodging-periods';

import type { TripRecord } from '@/fixtures/trip-overview-model';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { CanvasState } from '../trip-route-editing/canvas-model';
import type { AccommodationPeriod } from '../trip-route-editing/lodging-periods';

/** Accommodation periods own a compact activity timeline; transfers retain their route endpoints. */
export function VisitPeriods({ visit }: { visit: TripRecord }) {
  const { state } = useCanvas();
  const periods = accommodationPeriods(visit, state.records);
  const rentals = state.rentals.some((r) => r.from === visit.id || r.to === visit.id);
  return (
    <div
      className="rounded-xl border border-border bg-muted/30 px-3 py-2 sm:px-4"
      aria-label="Accommodation timeline"
    >
      <VisitTransport visit={visit} boundary="arrival" />
      {rentals && (
        <TimelineRow icon={CarFront}>
          <RentalSections visitId={visit.id} />
        </TimelineRow>
      )}
      {keyedAccommodationPeriods(periods).map(({ key, period }) => (
        <PeriodTimeline key={key} visit={visit} period={period} />
      ))}
      <VisitTransport visit={visit} boundary="departure" />
    </div>
  );
}

function TimelineRow({
  icon: Icon,
  date,
  children,
}: {
  icon: LucideIcon;
  date?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-5">
      <aside className="relative w-20 shrink-0 border-r-2 border-dotted border-app-accent/50 pr-6 pt-4 text-right text-xs font-semibold text-foreground sm:w-28">
        <span className="absolute -right-4 top-3 flex size-8 items-center justify-center rounded-full border border-app-accent bg-app-accent text-app-accent-foreground shadow-sm">
          <Icon className="size-4" aria-hidden />
        </span>
        {date}
      </aside>
      <div className="my-2 min-w-0 flex-1 rounded-lg border border-foreground/25 bg-card p-3 shadow-sm">
        {children}
      </div>
    </div>
  );
}

/** Visit endpoints share one missing-transport action; day views can omit already rendered journeys. */
export function VisitTransport({
  visit,
  boundary,
  missingOnly = false,
}: {
  visit: TripRecord;
  boundary: 'arrival' | 'departure';
  missingOnly?: boolean;
}) {
  const { state } = useCanvas();
  const records = state.records.filter(
    (r) =>
      r.kind === 'transport' &&
      (boundary === 'arrival'
        ? state.transitLinks[r.id]?.to === visit.id
        : state.transitLinks[r.id]?.from === visit.id)
  );
  if (!records.length)
    return (
      <TimelineRow icon={Plane}>
        <CanvasInsert
          label={`Add ${boundary} transport`}
          defaultKind="transport"
          slotLabel={boundary === 'arrival' ? 'Arrival transport' : 'Departure transport'}
          target={{
            after:
              boundary === 'departure' ? visit.id : state.order[state.order.indexOf(visit.id) - 1],
          }}
        />
      </TimelineRow>
    );
  if (missingOnly) return null;
  return records.map((record) => (
    <TimelineRow
      key={record.id}
      icon={Plane}
      date={<TransportDate record={record} boundary={boundary} />}
    >
      <TransitCard record={record} datesInRail />
    </TimelineRow>
  ));
}

function TransportDate({
  record,
  boundary,
}: {
  record: TripRecord;
  boundary: 'arrival' | 'departure';
}) {
  const { state } = useCanvas();
  const stamp = transportStamp(state, record, boundary);
  return (
    <>
      <span className="mb-1 block font-normal text-muted-foreground">
        {boundary === 'arrival' ? 'Arrival' : 'Departure'}
      </span>
      {isTripDate(stamp.date) && formatTripDate(stamp.date)}
      {stamp.time && <span className="mt-1 block tabular-nums">{stamp.time}</span>}
    </>
  );
}

function transportStamp(state: CanvasState, record: TripRecord, boundary: 'arrival' | 'departure') {
  const legs = canvasCalendar(state).filter((booking) => booking.recordId === record.id);
  const leg = boundary === 'arrival' ? legs.at(-1) : legs[0];
  if (!leg) return { date: record.schedule?.start, time: undefined };
  const arrival = boundary === 'arrival';
  const at = arrival ? leg.endAt : leg.startAt;
  if (!at) return { date: record.schedule?.start, time: undefined };
  const zone = arrival ? (leg.endTimeZone ?? leg.timeZone) : leg.timeZone;
  const wall = localDateTime(at, zone);
  return { date: wall.slice(0, 10), time: leg.allDay ? undefined : wall.slice(11, 16) };
}

function PeriodTimeline({ visit, period }: { visit: TripRecord; period: AccommodationPeriod }) {
  return (
    <TimelineRow
      icon={period.start || period.stays.length ? BedDouble : Lightbulb}
      date={<PeriodDates period={period} />}
    >
      <AccommodationPeriodView visit={visit} period={period} datesInRail />
      {(period.stays.length > 0 || period.activities.length > 0) && (
        <CanvasInsert
          label="Add within period"
          defaultKind="idea"
          target={{
            visitId: visit.id,
            start: period.start,
            stayId: period.stays.length === 1 ? period.stays[0]?.id : undefined,
          }}
        />
      )}
    </TimelineRow>
  );
}

function PeriodDates({ period }: { period: AccommodationPeriod }) {
  return (
    <>
      {period.start && formatTripDate(period.start)}
      {period.start && period.end && <span className="block text-app-accent">↓</span>}
      {period.end && formatTripDate(period.end)}
    </>
  );
}
