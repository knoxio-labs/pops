import { formatTripDate } from '@/fixtures/trip-overview-format';
import {
  BedDouble,
  CalendarDays,
  Circle,
  MapPin,
  PlaneLanding,
  PlaneTakeoff,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { SortableGrid, cn } from '@pops/ui';

import { AccommodationStay } from '../trip-route-editing/accommodation-stay';
import { useCanvas } from '../trip-route-editing/canvas-context';
import { ActivityCard } from '../trip-route-editing/canvas-items';
import { TransitCard } from '../trip-route-editing/canvas-transit';
import { dayClockIssues, orderVisitDayEntries } from './day-model';

import type { TripDate, TripRecord } from '@/fixtures/trip-overview-model';
import type { ReactNode } from 'react';

import type { VisitDayEntry } from './day-model';

/** Align a local-day marker and editable row on one dotted timeline rail. */
export function DayRow({
  marker,
  children,
  icon,
  messages,
}: {
  marker: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  messages?: string[];
}) {
  return (
    <div className={cn('flex gap-3', messages?.length && 'bg-destructive/10 text-destructive')}>
      <div className="w-28 shrink-0 pt-3 text-right text-xs font-semibold text-foreground">
        {marker}
      </div>
      <div className="relative min-w-0 flex-1 border-l-2 border-dotted border-app-accent/50 pb-3 pl-4">
        <span
          aria-hidden
          className="absolute left-0 top-4 -translate-x-1/2 rounded-full bg-card text-app-accent"
        >
          {icon ?? <Circle className="size-3" />}
        </span>
        <div className="rounded-lg border border-border bg-card p-2 shadow-sm">{children}</div>
        {messages?.map((message) => (
          <p key={message} className="pb-1 text-sm text-destructive" role="status">
            {message}
          </p>
        ))}
      </div>
    </div>
  );
}

function EntryMarker({ entry, day }: { entry: VisitDayEntry; day: TripDate }) {
  return (
    <span className="flex flex-col items-end gap-1">
      <span>{entry.time ?? formatTripDate(day)}</span>
      {entry.zone && (
        <span className="whitespace-nowrap text-xs font-normal text-muted-foreground">
          {entry.zone}
        </span>
      )}
      <span>{entry.direction ?? entry.stayBoundary}</span>
    </span>
  );
}

function EntryCard({ entry, visit }: { entry: VisitDayEntry; visit: TripRecord }) {
  if (entry.record.kind === 'transport') return <TransitCard record={entry.record} datesInRail />;
  if (entry.record.kind === 'stay')
    return <AccommodationStay stay={entry.record} standaloneDrag={false} />;
  return <ActivityCard item={entry.record} visit={visit} />;
}

function entryIcon(entry: VisitDayEntry) {
  if (entry.direction) {
    const Icon = { Arrive: PlaneLanding, Depart: PlaneTakeoff }[entry.direction];
    return <Icon className="size-3" />;
  }
  if (entry.stayBoundary) return <BedDouble className="size-3" />;
  if (entry.record.kind === 'person') return <Users className="size-3" />;
  if (entry.record.kind === 'event') return <CalendarDays className="size-3" />;
  if (entry.record.kind === 'idea') return <MapPin className="size-3" />;
  return <Circle className="size-3" />;
}

/** Reorder complete day rows without changing source dates, clocks or purchase state. */
export function DayEntries({
  entries,
  visit,
  day,
}: {
  entries: VisitDayEntry[];
  visit: TripRecord;
  day: TripDate;
}) {
  const { state, change } = useCanvas();
  const [preview, setPreview] = useState<VisitDayEntry[] | null>(null);
  const orderKey = `visit-day:${visit.id}:${day}`;
  const ordered = orderVisitDayEntries(entries, state.itemOrders[orderKey]);
  const issues = dayClockIssues(preview ?? ordered);
  return (
    <SortableGrid
      items={ordered}
      getKey={(entry) => entry.id}
      columnsClassName="grid-cols-1"
      className="gap-0"
      onPreviewOrderChange={setPreview}
      onReorder={(next) => {
        setPreview(null);
        change({
          ...state,
          itemOrders: { ...state.itemOrders, [orderKey]: next.map((entry) => entry.id) },
        });
      }}
      renderItem={(entry) => (
        <DayRow
          marker={<EntryMarker entry={entry} day={day} />}
          icon={entryIcon(entry)}
          messages={issues[entry.id]}
        >
          <EntryCard entry={entry} visit={visit} />
        </DayRow>
      )}
    />
  );
}
