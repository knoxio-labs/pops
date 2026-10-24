import { formatTripDate } from '@/fixtures/trip-overview-format';
import { TriangleAlert } from 'lucide-react';

import { cn } from '@pops/ui';

import { AccommodationStay, hasInvalidStayDates } from './accommodation-stay';
import { useCanvas } from './canvas-context';
import { CanvasInsert } from './canvas-insert';
import { CanvasItemGroup } from './canvas-items';
import { outsideVisit } from './constraints';
import { accommodationPeriods } from './lodging-periods';

import type { TripRecord } from '@/fixtures/trip-overview-model';

import type { CanvasState } from './canvas-model';
import type { AccommodationPeriod } from './lodging-periods';

function periodActivities(
  period: AccommodationPeriod,
  state: CanvasState,
  visitId: string
): TripRecord[] {
  const stayIds = new Set(period.stays.map((stay) => stay.id));
  const automatic = period.activities.filter((item) => {
    const assignedStay = state.records.find(
      (record) =>
        record.id === state.activityStays[item.id] &&
        record.kind === 'stay' &&
        record.visitId === visitId
    );
    return !assignedStay || stayIds.has(assignedStay.id);
  });
  const assigned = state.records.filter((item) => {
    const assignedStay = state.activityStays[item.id];
    return (
      item.visitId === visitId &&
      ['event', 'idea', 'person'].includes(item.kind) &&
      assignedStay !== undefined &&
      stayIds.has(assignedStay)
    );
  });
  return [...new Map([...automatic, ...assigned].map((item) => [item.id, item])).values()];
}

function PeriodDates({ period }: { period: AccommodationPeriod }) {
  if ((!period.start && !period.end) || (period.missing && (!period.start || !period.end)))
    return null;
  return (
    <div className="text-xs text-muted-foreground">
      {period.start && formatTripDate(period.start)}
      {period.start && period.end && ' → '}
      {period.end && formatTripDate(period.end)}
    </div>
  );
}

function PeriodView({ visit, period }: { visit: TripRecord; period: AccommodationPeriod }) {
  const { state } = useCanvas();
  const invalid =
    period.overlap ||
    period.conflict === true ||
    period.stays.some(
      (stay) =>
        hasInvalidStayDates(stay) || outsideVisit(visit, stay) || stay.placeId !== visit.placeId
    );
  const items = periodActivities(period, state, visit.id);
  const stayId = period.stays.length === 1 ? period.stays[0]?.id : undefined;
  return (
    <section className={cn('space-y-0.5', invalid && 'border-l-2 border-destructive pl-2')}>
      {period.stays.length === 0 && <PeriodDates period={period} />}
      <PeriodWarnings visit={visit} period={period} />
      {period.stays.map((stay) => (
        <AccommodationStay key={stay.id} stay={stay} />
      ))}
      {period.missing && (
        <div className="flex min-h-11 items-center justify-between gap-2">
          <span className="text-sm text-foreground">Accommodation needed</span>
          <CanvasInsert
            target={{ visitId: visit.id, start: period.start, end: period.end }}
            label="Add accommodation"
            defaultKind="stay"
            line={false}
          />
        </div>
      )}
      <CanvasItemGroup
        visit={visit}
        items={items}
        containerId={`period:${period.id}`}
        period={{ start: period.start, end: period.end, stayId }}
      />
    </section>
  );
}

function PeriodWarnings({ visit, period }: { visit: TripRecord; period: AccommodationPeriod }) {
  const messages = [
    ...(period.conflict ? ['Check visit dates'] : []),
    ...(period.overlap ? ['Check overlapping accommodation'] : []),
    ...(period.stays.some((stay) => outsideVisit(visit, stay))
      ? ['Accommodation outside visit dates']
      : []),
    ...(period.stays.some((stay) => stay.placeId !== visit.placeId)
      ? ['Accommodation in a different location']
      : []),
  ];
  return messages.map((message) => (
    <p key={message} role="alert" className="flex items-center gap-2 text-sm text-destructive">
      <TriangleAlert className="size-4" aria-hidden />
      {message}
    </p>
  ));
}

/** Render source accommodation and its activity intervals, retaining unknown dates and conflicts. */
export function AccommodationView({ visit }: { visit: TripRecord }) {
  const { state } = useCanvas();
  if (state.homePlaces.includes(visit.placeId)) {
    const items = state.records.filter(
      (record) => record.visitId === visit.id && ['event', 'idea', 'person'].includes(record.kind)
    );
    return items.length ? (
      <CanvasItemGroup visit={visit} items={items} containerId={`home:${visit.id}`} />
    ) : null;
  }
  return (
    <div className="space-y-2 border-l pl-3">
      {accommodationPeriods(visit, state.records).map((period) => (
        <PeriodView key={period.id} visit={visit} period={period} />
      ))}
    </div>
  );
}
