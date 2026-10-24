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

/** A whole movable accommodation card edits only its own source facts and explicit status choices. */
export function AccommodationStay({ stay }: { stay: TripRecord }) {
  const canvas = useCanvas();
  const { state, change } = canvas;
  const update = (record: TripRecord): void =>
    change({
      ...state,
      records: state.records.map((item) => (item.id === stay.id ? record : item)),
    });
  return (
    <div
      data-canvas-id={stay.id}
      draggable
      role="group"
      aria-label={stay.title ?? 'Accommodation'}
      className={cn(
        'group/stay space-y-2 rounded-lg border p-3',
        stay.purchase === 'Purchased'
          ? 'border-solid border-l-4 border-l-app-accent'
          : 'border-dashed',
        canvas.dragged === stay.id && 'border-dashed'
      )}
      onDragStart={(event) => event.stopPropagation()}
      onDragEnd={(event) => event.stopPropagation()}
    >
      <div className={cn('space-y-2', canvas.dragged === stay.id && 'invisible')}>
        <div className="flex items-center gap-2">
          <GripVertical
            className="size-4 shrink-0 cursor-grab opacity-0 group-hover/stay:opacity-100 group-focus-within/stay:opacity-100 pointer-coarse:opacity-100"
            aria-hidden
          />
          <TextInput
            key={stay.title ?? ''}
            aria-label="Accommodation name"
            variant="ghost"
            defaultValue={stay.title ?? ''}
            onBlur={(event) => update({ ...stay, title: event.currentTarget.value })}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BedDouble className="size-4" aria-hidden />
          <span>{state.places.find((place) => place.id === stay.placeId)?.name}</span>
        </div>
        <StayStatus stay={stay} update={update} />
        <StayDates stay={stay} update={update} />
        {hasInvalidStayDates(stay) && (
          <p role="alert" className="text-sm text-foreground">
            Check accommodation dates
          </p>
        )}
      </div>
    </div>
  );
}
