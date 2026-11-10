import { useState } from 'react';

import { Button, Popover, PopoverContent, PopoverTrigger, TextInput } from '@pops/ui';

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
  const [open, setOpen] = useState(false);
  const arrangements: TripRecord['arrangement'][] = [
    'Not arranged',
    'Agreed',
    'Booked',
    'Not needed',
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
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
              onClick={() => {
                update({ ...stay, arrangement });
                setOpen(false);
              }}
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

/** Edit source accommodation name, dates, arrangement and purchase independently. */
export function AccommodationEditor({ stay }: { stay: TripRecord }) {
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
