import { useState } from 'react';

import { Autocomplete, Button, ComboboxSelect, TextInput } from '@pops/ui';

import { applyFlightWindow } from './model';

import type { TripCalendarState } from './model';

interface ProjectionProps {
  state: TripCalendarState;
  change: (next: TripCalendarState) => void;
}
const kindOptions = [
  { value: 'all', label: 'All kinds' },
  { value: 'flight', label: 'Flights' },
  { value: 'stay', label: 'Stays' },
  { value: 'event', label: 'Events' },
  { value: 'rental', label: 'Rentals' },
  { value: 'availability', label: 'Availability' },
];

/** Offers source and platform zone suggestions while retaining unrestricted IANA text input. */
export function calendarZoneSuggestions(state: TripCalendarState) {
  return [
    ...new Set([
      ...state.bookings.flatMap((booking) =>
        [booking.timeZone, booking.endTimeZone].filter((zone) => zone !== undefined)
      ),
      ...Intl.supportedValuesOf('timeZone'),
    ]),
  ]
    .filter(Boolean)
    .toSorted()
    .map((zone) => ({ label: zone, value: zone }));
}

/** Changes explicit projection inputs without editing any source booking or availability. */
export function CalendarControls({
  state,
  change,
  selected,
  select,
}: ProjectionProps & {
  selected: string;
  select: (id: string) => void;
}) {
  return (
    <section aria-label="Calendar filters" className="space-y-3 rounded-xl border bg-muted/30 p-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TextInput
          containerClassName="min-w-0"
          label="From"
          type="date"
          value={state.from}
          onChange={(event) => change({ ...state, from: event.currentTarget.value })}
        />
        <TextInput
          containerClassName="min-w-0"
          label="To"
          type="date"
          value={state.to}
          onChange={(event) => change({ ...state, to: event.currentTarget.value })}
        />
        <ProjectionControls state={state} change={change} />
      </div>
      <FlightPreset state={state} change={change} selected={selected} select={select} />
    </section>
  );
}

function ProjectionControls({ state, change }: ProjectionProps) {
  return (
    <>
      <div className="col-span-2 min-w-0 space-y-1 lg:col-span-1">
        <label htmlFor="calendar-zone" className="text-sm">
          Display zone
        </label>
        <Autocomplete
          id="calendar-zone"
          aria-label="Display zone"
          chrome="bare"
          emptyMessage={null}
          value={state.timeZone}
          suggestions={calendarZoneSuggestions(state)}
          onChange={(timeZone) => change({ ...state, timeZone })}
        />
      </div>
      <div className="col-span-2 min-w-0 space-y-1 lg:col-span-1">
        <span className="text-sm">Kind</span>
        <ComboboxSelect
          aria-label="Kind"
          value={state.kind}
          options={kindOptions}
          onChange={(kind) => {
            if (
              kind === 'all' ||
              kind === 'flight' ||
              kind === 'stay' ||
              kind === 'event' ||
              kind === 'rental' ||
              kind === 'availability'
            )
              change({ ...state, kind });
          }}
        />
      </div>
    </>
  );
}

function flightChoices(state: TripCalendarState) {
  return [
    ...new Map(
      state.bookings
        .filter((booking) => booking.kind === 'flight')
        .map((booking) => [
          booking.recordId,
          {
            value: booking.recordId,
            label: state.bookings
              .filter((leg) => leg.kind === 'flight' && leg.recordId === booking.recordId)
              .map((leg) => leg.title)
              .join(' · '),
          },
        ])
    ).values(),
  ];
}

function FlightPreset({
  state,
  change,
  selected,
  select,
}: ProjectionProps & { selected: string; select: (id: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const flights = flightChoices(state);
  if (!flights.length) return null;
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <span className="text-sm">Flight journey</span>
          <ComboboxSelect
            aria-label="Flight journey"
            value={selected}
            options={flights}
            placeholder="Select flight journey"
            onChange={(value) => {
              if (typeof value === 'string') {
                select(value);
                setError(null);
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          disabled={!selected}
          onClick={() => {
            const result = applyFlightWindow(state, selected);
            change(result.state);
            setError(result.error);
          }}
        >
          Around this flight
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
