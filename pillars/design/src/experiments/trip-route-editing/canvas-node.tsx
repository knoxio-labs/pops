import { formatTripDate } from '@/fixtures/trip-overview-format';
import { GripVertical, Trash2 } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { AccommodationView } from './accommodation-view';
import { AlternativeGroups } from './canvas-alternatives';
import { BookingFindings } from './canvas-booking-times';
import { canvasDragType, useCanvas } from './canvas-context';
import { CanvasFields } from './canvas-fields';
import { CanvasInsert } from './canvas-insert';
import { routeIssues } from './canvas-issues';
import { ActivityCard, activityIssues } from './canvas-items';
import { canvasName } from './canvas-model';
import { removeCanvasVisit } from './canvas-remove';
import { RentalSections } from './canvas-rentals';
import { TransitCard } from './canvas-transit';
import { accommodationPeriods } from './lodging-periods';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Render a flat route record; contained cities delegate their surface to the surrounding path. */
export function CanvasNode({
  record,
  index = 0,
  datesInRail = false,
  contained = false,
}: {
  record: TripRecord;
  index?: number;
  datesInRail?: boolean;
  contained?: boolean;
}) {
  if (record.kind === 'transport') return <TransitCard record={record} datesInRail={datesInRail} />;
  if (record.kind === 'gap')
    return (
      <AlternativeGroups
        gap={record}
        renderRecord={(item, position) => <CanvasNode record={item} index={position} contained />}
      />
    );
  return record.kind === 'city' ? (
    <CityCard record={record} index={index} datesInRail={datesInRail} contained={contained} />
  ) : (
    <ActivityCard item={record} />
  );
}

function CityCard({
  record,
  index,
  datesInRail,
  contained,
}: {
  record: TripRecord;
  index: number;
  datesInRail: boolean;
  contained: boolean;
}) {
  const canvas = useCanvas();
  const { state, preview } = canvas;
  const name = canvasName(state, record);
  const dragged = state.records.find(
    (item) => item.id === canvas.dragged && !['city', 'transport', 'gap'].includes(item.kind)
  );
  const hoverIssues =
    dragged && canvas.hoverVisit === record.id ? activityIssues(dragged, record) : [];
  const issues = [...(routeIssues(preview)[record.id] ?? []), ...hoverIssues];
  return (
    <article
      data-canvas-id={record.id}
      aria-label={name}
      className={cn(
        'group/visit min-w-0 space-y-1',
        !contained && 'rounded-lg border border-dashed border-border px-2 py-1',
        issues.length > 0 && 'border-destructive bg-destructive/10'
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(canvasDragType)) {
          e.preventDefault();
          canvas.setHoverVisit(record.id);
        }
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(canvasDragType);
        const source = state.records.find((r) => r.id === id);
        if (source && source.kind !== 'city' && source.kind !== 'transport') {
          e.preventDefault();
          e.stopPropagation();
          canvas.move(id, { visitId: record.id });
        }
      }}
    >
      <CityHeader record={record} index={index} datesInRail={datesInRail} />
      <CityContents record={record} issues={issues} />
    </article>
  );
}

function CityContents({ record, issues }: { record: TripRecord; issues: string[] }) {
  const canvas = useCanvas();
  return (
    <>
      <RentalSections visitId={record.id} />
      {issues.map((issue) => (
        <p key={issue} className="text-sm font-medium text-foreground">
          {issue}
        </p>
      ))}
      <BookingFindings recordId={record.id} />
      {canvas.showDetails ? (
        <AccommodationView visit={record} />
      ) : (
        <CityAccommodationSummary visit={record} />
      )}
    </>
  );
}

function CityHeader({
  record,
  index,
  datesInRail,
}: {
  record: TripRecord;
  index: number;
  datesInRail: boolean;
}) {
  const canvas = useCanvas();
  const { state } = canvas;
  const name = canvasName(state, record);
  return (
    <div className="flex min-w-0 items-start">
      <span
        role="img"
        aria-label={`Drag visit ${index + 1}`}
        className="flex size-11 shrink-0 cursor-grab items-center justify-center opacity-0 group-hover/visit:opacity-100 group-focus-within/visit:opacity-100 pointer-coarse:opacity-100"
      >
        <GripVertical className="pointer-events-none size-4" aria-hidden />
      </span>
      <CanvasFields record={record} showTiming={!datesInRail} />
      <CanvasInsert
        line={false}
        defaultKind="idea"
        label={`Add inside ${name}`}
        target={{ visitId: record.id }}
      />
      <Button
        variant="ghost"
        aria-label={`Remove ${name}`}
        className="min-h-11 min-w-11 opacity-0 group-hover/visit:opacity-100 group-focus-within/visit:opacity-100 pointer-coarse:opacity-100"
        onClick={() => canvas.change(removeCanvasVisit(state, record.id))}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

function CityAccommodationSummary({ visit }: { visit: TripRecord }) {
  const { state } = useCanvas();
  if (state.homePlaces.includes(visit.placeId)) return null;
  const missing = accommodationPeriods(visit, state.records).filter(
    (period) => period.missing && period.start && period.end
  );
  return missing.map((period) => {
    if (!period.start || !period.end) return null;
    const nights =
      (Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / 86400000;
    return (
      <CanvasInsert
        key={period.id}
        target={{ visitId: visit.id, start: period.start, end: period.end }}
        label="Add accommodation"
        defaultKind="stay"
        slotLabel={`${nights} uncovered ${nights === 1 ? 'night' : 'nights'} · ${formatTripDate(period.start)} → ${formatTripDate(period.end)}`}
      />
    );
  });
}
