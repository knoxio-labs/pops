import { formatTripDate } from '@/fixtures/trip-overview-format';
import { BedDouble, GripVertical } from 'lucide-react';
import { useState } from 'react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput, cn } from '@pops/ui';

import { useCanvas } from './canvas-context';
import { isTripDate } from './lodging-periods';

import type { TripRecord } from '@/fixtures/trip-overview-model';

function StayDates({ stay, update }: { stay: TripRecord; update: (record: TripRecord) => void }) {
  const [pendingEnd, setPendingEnd] = useState(stay.schedule?.end);
  const changeDate = (field: 'start' | 'end', value: string): void => {
    if (value && !isTripDate(value)) return;
    if (field === 'start') {
      update({
        ...stay,
        schedule: isTripDate(value)
          ? { ...stay.schedule, start: value, end: stay.schedule ? stay.schedule.end : pendingEnd }
          : undefined,
      });
    } else {
      const end = isTripDate(value) ? value : undefined;
      setPendingEnd(end);
      if (stay.schedule) update({ ...stay, schedule: { ...stay.schedule, end } });
    }
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <TextInput
        label="Check-in"
        type="date"
        value={stay.schedule?.start ?? ''}
        onInput={(event) => changeDate('start', event.currentTarget.value)}
      />
      <TextInput
        label="Check-out"
        type="date"
        value={stay.schedule ? (stay.schedule.end ?? '') : (pendingEnd ?? '')}
        onInput={(event) => changeDate('end', event.currentTarget.value)}
      />
    </div>
  );
}

function StayStatus({ stay, update }: { stay: TripRecord; update: (record: TripRecord) => void }) {
  const arrangements: TripRecord['arrangement'][] = [
    'Not arranged',
    'Agreed',
    'Booked',
    'Not needed',
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button aria-label="Accommodation arrangement" variant="outline" className="min-h-11">
            {stay.arrangement}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex flex-col gap-1">
          {arrangements.map((arrangement) => (
            <Button
              key={arrangement}
              variant={arrangement === stay.arrangement ? 'secondary' : 'ghost'}
              onClick={() => update({ ...stay, arrangement })}
            >
              {arrangement}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
      <Button
        aria-pressed={stay.purchase === 'Purchased'}
        variant={stay.purchase === 'Purchased' ? 'default' : 'outline'}
        className="min-h-11"
        onClick={() =>
          update({ ...stay, purchase: stay.purchase === 'Purchased' ? undefined : 'Purchased' })
        }
      >
        Purchased
      </Button>
    </div>
  );
}

/** Detect invalid source stay bounds while retaining incomplete schedules for editing. */
export function hasInvalidStayDates(stay: TripRecord): boolean {
  const schedule = stay.schedule;
  if (!schedule) return false;
  return (
    !isTripDate(schedule.start) ||
    Boolean(schedule.end && (!isTripDate(schedule.end) || schedule.end <= schedule.start))
  );
}

function StayEditor({ stay }: { stay: TripRecord }) {
  const { state, change } = useCanvas();
  const update = (record: TripRecord): void =>
    change({
      ...state,
      records: state.records.map((item) => (item.id === stay.id ? record : item)),
    });
  return (
    <div className="space-y-3">
      <TextInput
        key={stay.title ?? ''}
        aria-label="Accommodation name"
        defaultValue={stay.title ?? ''}
        onBlur={(event) => update({ ...stay, title: event.currentTarget.value })}
      />
      <p className="text-xs text-muted-foreground">
        {state.places.find((place) => place.id === stay.placeId)?.name}
      </p>
      <StayDates stay={stay} update={update} />
      <StayStatus stay={stay} update={update} />
    </div>
  );
}

function StaySummary({ stay }: { stay: TripRecord }) {
  const schedule = stay.schedule;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 text-sm">
      <BedDouble className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="font-medium">{stay.title}</span>
      {schedule && (
        <span className="font-normal text-muted-foreground">
          {formatTripDate(schedule.start)}
          {schedule.end && ` → ${formatTripDate(schedule.end)}`}
        </span>
      )}
      <span className="text-xs font-normal text-muted-foreground">{stay.arrangement}</span>
      {stay.purchase && (
        <span className="text-xs font-normal text-muted-foreground">{stay.purchase}</span>
      )}
    </span>
  );
}

/** Compact movable stay summary exposes source name, dates and status; editing stays explicit. */
export function AccommodationStay({ stay }: { stay: TripRecord }) {
  const canvas = useCanvas();
  const invalid = hasInvalidStayDates(stay);
  return (
    <div
      data-canvas-id={stay.id}
      draggable
      role="group"
      aria-label={stay.title ?? 'Accommodation'}
      className={cn(
        'group/stay min-h-11 border-l-2 border-transparent pl-2',
        stay.purchase === 'Purchased' && 'border-l-app-accent',
        invalid && 'border-destructive bg-destructive/10',
        canvas.dragged === stay.id && 'border border-dashed border-app-accent'
      )}
      onDragStart={(event) => event.stopPropagation()}
      onDragEnd={(event) => event.stopPropagation()}
    >
      <div
        className={cn(
          'flex min-h-11 items-center gap-2',
          canvas.dragged === stay.id && 'invisible'
        )}
      >
        <GripVertical
          className="size-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover/stay:opacity-100 group-focus-within/stay:opacity-100 pointer-coarse:opacity-100"
          aria-hidden
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-label={`Edit accommodation ${stay.title ?? ''}`.trim()}
              variant="ghost"
              className="min-h-11 min-w-0 flex-1 justify-start whitespace-normal px-0 text-left"
            >
              <StaySummary stay={stay} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <StayEditor stay={stay} />
          </PopoverContent>
        </Popover>
      </div>
      {invalid && (
        <p role="alert" className="pb-1 pl-5 text-sm text-destructive">
          Check accommodation dates
        </p>
      )}
    </div>
  );
}
