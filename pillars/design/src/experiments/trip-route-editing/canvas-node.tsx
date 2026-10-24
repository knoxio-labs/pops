import { formatTripDate } from '@/fixtures/trip-overview-format';
import { GripVertical, Trash2 } from 'lucide-react';

import { Button, SortableGrid, cn } from '@pops/ui';

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
import { TransitCard } from './canvas-transit';
import { accommodationPeriods } from './lodging-periods';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Every visit, transport and alternative group participates in the same movable route graph. */
export function CanvasNode({ record, index = 0 }: { record: TripRecord; index?: number }) {
  if (record.kind === 'transport') return <TransitCard record={record} />;
  if (record.kind === 'gap')
    return (
      <AlternativeGroups
        gap={record}
        renderRecord={(item, position) => <CanvasNode record={item} index={position} />}
      />
    );
  return record.kind === 'city' ? (
    <CityCard record={record} index={index} />
  ) : (
    <ActivityCard item={record} />
  );
}

function CityCard({ record, index }: { record: TripRecord; index: number }) {
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
        'group/visit space-y-3 rounded-xl border border-dashed bg-card p-4',
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
      <CityHeader record={record} index={index} />
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
      <NestedVisits parentId={record.id} />
      <CanvasInsert
        line={false}
        defaultKind="idea"
        label={`Add inside ${name}`}
        target={{ visitId: record.id }}
      />
    </article>
  );
}

function CityHeader({ record, index }: { record: TripRecord; index: number }) {
  const canvas = useCanvas();
  const { state } = canvas;
  const name = canvasName(state, record);
  return (
    <div className="flex items-start gap-1">
      <span
        role="img"
        aria-label={`Drag visit ${index + 1}`}
        className="flex size-11 shrink-0 cursor-grab items-center justify-center opacity-0 group-hover/visit:opacity-100 group-focus-within/visit:opacity-100 pointer-coarse:opacity-100"
      >
        <GripVertical className="pointer-events-none size-4" aria-hidden />
      </span>
      <CanvasFields record={record} />
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

function NestedVisits({ parentId }: { parentId: string }) {
  const { state, change } = useCanvas();
  const ids = state.itemOrders[`nested:${parentId}`] ?? [];
  const records = state.records
    .filter((r) => state.parents[r.id] === parentId)
    .toSorted((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  if (!records.length) return null;
  return (
    <div className="ml-4 border-l pl-3">
      <SortableGrid
        items={records}
        getKey={(r) => r.id}
        columnsClassName="grid-cols-1"
        onReorder={(next) =>
          change({
            ...state,
            itemOrders: { ...state.itemOrders, [`nested:${parentId}`]: next.map((r) => r.id) },
          })
        }
        renderItem={(record, index) => <CanvasNode record={record} index={index} />}
      />
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
      <p key={period.id} className="text-sm text-foreground">
        {nights} uncovered {nights === 1 ? 'night' : 'nights'} · {formatTripDate(period.start)} →{' '}
        {formatTripDate(period.end)}
      </p>
    );
  });
}
