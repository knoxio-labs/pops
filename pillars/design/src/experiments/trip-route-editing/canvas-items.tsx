import { formatTripDate, presentTripRecord } from '@/fixtures/trip-overview-format';
import { isPurchasedArrangement, tripItemTier } from '@/fixtures/trip-overview-model';
import { GripVertical } from 'lucide-react';
import { useState } from 'react';

import { SortableGrid, cn } from '@pops/ui';

import { ActivityFields } from './canvas-activity-fields';
import { BookingFindings } from './canvas-booking-times';
import { useCanvas, canvasDragType } from './canvas-context';
import { outsideVisit } from './constraints';

import type { TripDate, TripRecord } from '@/fixtures/trip-overview-model';

interface PeriodTarget {
  start?: TripDate;
  end?: TripDate;
  stayId?: string;
}

function dateOrderIssues(items: TripRecord[]): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  let previous: { id: string; start: TripDate } | undefined;
  for (const item of items) {
    const start = item.schedule?.start ?? item.timing?.arrival;
    if (!start) continue;
    if (previous && start < previous.start) {
      const message = `${formatTripDate(start)} < ${formatTripDate(previous.start)}`;
      issues[item.id] = [...(issues[item.id] ?? []), message];
      issues[previous.id] = [...(issues[previous.id] ?? []), message];
    }
    previous = { id: item.id, start };
  }
  return issues;
}

/** Activities move through the source graph, keeping their own dates and location facts. */
export function CanvasItemGroup({
  visit,
  items,
  containerId,
  period,
}: {
  visit: TripRecord;
  items: TripRecord[];
  containerId: string;
  period?: PeriodTarget;
}) {
  const canvas = useCanvas();
  const [preview, setPreview] = useState<TripRecord[] | null>(null);
  const ids = canvas.state.itemOrders[containerId] ?? items.map((item) => item.id);
  const position = (id: string): number => (ids.includes(id) ? ids.indexOf(id) : ids.length);
  const ordered = items.toSorted((a, b) => position(a.id) - position(b.id));
  const messages = dateOrderIssues(preview ?? ordered);
  return (
    <div
      className="min-h-4"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(canvasDragType)) return;
        e.preventDefault();
        e.stopPropagation();
        canvas.setHoverVisit(visit.id);
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(canvasDragType);
        const item = canvas.state.records.find((record) => record.id === id);
        if (!item || item.kind === 'city' || item.kind === 'transport') return;
        e.preventDefault();
        e.stopPropagation();
        canvas.move(id, { visitId: visit.id, stayId: period?.stayId ?? '' });
      }}
    >
      <SortableGrid
        items={ordered}
        getKey={(r) => r.id}
        columnsClassName="grid-cols-1"
        className="gap-0"
        onPreviewOrderChange={setPreview}
        onReorder={(next) =>
          canvas.change({
            ...canvas.state,
            itemOrders: { ...canvas.state.itemOrders, [containerId]: next.map((r) => r.id) },
          })
        }
        renderItem={(item) => (
          <ActivityCard
            item={item}
            visit={visit}
            period={period}
            orderMessages={messages[item.id]}
          />
        )}
      />
    </div>
  );
}

/** Standalone and visit-linked activities share editable source fields and booking warnings. */
export function ActivityCard({
  item,
  visit,
  period,
  orderMessages,
}: {
  item: TripRecord;
  visit?: TripRecord;
  period?: PeriodTarget;
  orderMessages?: string[];
}) {
  const canvas = useCanvas();
  const { state } = canvas;
  const display = presentTripRecord(item, state.records);
  const paid = isPurchasedArrangement(item);
  const hovered =
    item.id === canvas.dragged
      ? state.records.find((record) => record.id === canvas.hoverVisit)
      : undefined;
  const rootItems = canvas.preview.order.flatMap((id) =>
    canvas.preview.records.filter((record) => record.id === id)
  );
  const orderIssues = orderMessages ?? (visit ? [] : (dateOrderIssues(rootItems)[item.id] ?? []));
  const messages = [...activityIssues(item, hovered ?? visit, period), ...orderIssues];
  return (
    <div
      data-canvas-id={item.id}
      aria-label={`Drag ${display.title}`}
      className={cn(
        'group/item min-h-11 border-l-2 border-transparent pl-2',
        paid && 'border-l-app-accent',
        messages.length > 0 && 'border-destructive bg-destructive/10'
      )}
    >
      <div className="flex min-h-11 items-center gap-2">
        <GripVertical
          className="size-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 pointer-coarse:opacity-100"
          aria-hidden
        />
        <ActivityFields item={item} />
        <span className="shrink-0 text-xs text-muted-foreground">{tripItemTier(item)}</span>
      </div>
      <BookingFindings recordId={item.id} />
      {messages.map((message) => (
        <p key={message} className="pb-1 pl-5 text-sm text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}

function periodIssues(item: TripRecord, period?: PeriodTarget): string[] {
  const start = item.schedule?.start;
  const end = item.schedule?.end ?? start;
  const messages: string[] = [];
  if (start && period?.start && start < period.start)
    messages.push(`${formatTripDate(start)} < ${formatTripDate(period.start)}`);
  if (end && period?.end && end >= period.end)
    messages.push(`${formatTripDate(end)} ≥ ${formatTripDate(period.end)}`);
  return messages;
}

/** Hover and committed placements compare fixed source facts without silently rewriting them. */
export function activityIssues(
  item: TripRecord,
  visit?: TripRecord,
  period?: PeriodTarget
): string[] {
  if (!visit) return periodIssues(item, period);
  return [
    ...(outsideVisit(visit, item) ? ['Outside visit dates'] : []),
    ...(item.placeId && visit.placeId && item.placeId !== visit.placeId
      ? ['Different location']
      : []),
    ...periodIssues(item, period),
  ];
}
