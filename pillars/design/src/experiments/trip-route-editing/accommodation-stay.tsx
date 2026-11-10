import { formatTripDate } from '@/fixtures/trip-overview-format';
import { BedDouble, GripVertical } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, cn } from '@pops/ui';

import { AccommodationEditor } from './accommodation-editor';
import { useCanvas } from './canvas-context';
import { isTripDate } from './lodging-periods';

import type { TripRecord } from '@/fixtures/trip-overview-model';
import type { DragEvent } from 'react';

/** Detect invalid source stay bounds while retaining incomplete schedules for editing. */
export function hasInvalidStayDates(stay: TripRecord): boolean {
  const schedule = stay.schedule;
  if (!schedule) return false;
  return (
    !isTripDate(schedule.start) ||
    Boolean(schedule.end && (!isTripDate(schedule.end) || schedule.end <= schedule.start))
  );
}

function StaySummary({ stay, showDates }: { stay: TripRecord; showDates: boolean }) {
  const schedule = stay.schedule;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 text-sm">
      <BedDouble className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="font-medium">{stay.title}</span>
      {showDates && schedule && (
        <span className="font-medium text-foreground">
          {formatTripDate(schedule.start)}
          {schedule.end && ` → ${formatTripDate(schedule.end)}`}
        </span>
      )}
      <span
        className={cn(
          'text-xs font-normal text-muted-foreground',
          stay.purchase && 'font-medium text-app-accent'
        )}
      >
        {stay.purchase ?? stay.arrangement}
      </span>
    </span>
  );
}

/** Compact stay editor; standaloneDrag=false delegates dragging to its containing sortable row. */
export function AccommodationStay({
  stay,
  showDates = true,
  standaloneDrag = true,
}: {
  stay: TripRecord;
  showDates?: boolean;
  standaloneDrag?: boolean;
}) {
  const canvas = useCanvas();
  const invalid = hasInvalidStayDates(stay);
  return (
    <div
      data-canvas-id={stay.id}
      draggable={standaloneDrag}
      role="group"
      aria-label={stay.title ?? 'Accommodation'}
      className={cn(
        'group/stay min-h-11 border-l-2 border-transparent pl-2',
        stay.purchase === 'Purchased' && 'border-l-app-accent bg-app-accent/10',
        invalid && 'border-destructive bg-destructive/10',
        canvas.dragged === stay.id && 'border border-dashed border-border'
      )}
      onDragStart={standaloneDrag ? stopDragPropagation : undefined}
      onDragEnd={standaloneDrag ? stopDragPropagation : undefined}
    >
      <div
        className={cn(
          'flex min-h-11 items-center gap-2',
          canvas.dragged === stay.id && 'invisible'
        )}
      >
        <span
          className="flex size-11 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 group-hover/stay:opacity-100 group-focus-within/stay:opacity-100 pointer-coarse:opacity-100"
          aria-hidden
        >
          <GripVertical className="size-3.5" />
        </span>
        <StayPopover stay={stay} showDates={showDates} />
      </div>
      {invalid && (
        <p role="alert" className="pb-1 pl-5 text-sm text-destructive">
          Check accommodation dates
        </p>
      )}
    </div>
  );
}

function StayPopover({ stay, showDates }: { stay: TripRecord; showDates: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Edit accommodation ${stay.title ?? ''}`.trim()}
          variant="ghost"
          className="min-h-11 min-w-0 max-w-full justify-start whitespace-normal px-0 text-left hover:bg-transparent"
        >
          <StaySummary stay={stay} showDates={showDates} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <AccommodationEditor stay={stay} />
      </PopoverContent>
    </Popover>
  );
}

function stopDragPropagation(event: DragEvent<HTMLDivElement>) {
  event.stopPropagation();
}
