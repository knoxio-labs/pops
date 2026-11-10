import { Select, TextInput } from '@pops/ui';

import { activeJourneys } from './model';

import type { JSX } from 'react';

import type { CalendarSelection, CalendarSnapshot } from './types';

/** Explicit date, zone, kind and source-window choices; no local timezone is assumed. */
export function CalendarControls({
  snapshot,
  selection,
  onChange,
}: {
  snapshot: CalendarSnapshot;
  selection: CalendarSelection;
  onChange: (selection: CalendarSelection) => void;
}): JSX.Element {
  const props = { snapshot, selection, onChange };
  return (
    <section
      aria-label="Calendar filters"
      className="space-y-3 rounded-xl border border-border p-3"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput
          label="From date"
          type="date"
          value={selection.from}
          className="min-h-11"
          onChange={(event) => onChange({ ...selection, from: event.target.value })}
        />
        <TextInput
          label="To date"
          type="date"
          value={selection.to}
          className="min-h-11"
          onChange={(event) => onChange({ ...selection, to: event.target.value })}
        />
        <TextInput
          label="Display time zone"
          value={selection.zone}
          placeholder="Choose an IANA time zone"
          className="min-h-11"
          onChange={(event) => onChange({ ...selection, zone: event.target.value })}
        />
      </div>
      <SourceFilters {...props} />
      <p className="text-xs text-muted-foreground">
        Date bounds are inclusive. Unresolved clocks retain their source dates; unknown dates and
        timing issues remain available below.
      </p>
    </section>
  );
}

function SourceFilters({
  snapshot,
  selection,
  onChange,
}: Parameters<typeof CalendarControls>[0]): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label="Kind"
        className="min-h-11"
        value={selection.kind}
        options={[
          { value: 'all', label: 'All sources' },
          { value: 'journey', label: 'Journeys' },
          { value: 'stay', label: 'Stays' },
          { value: 'event', label: 'Events' },
        ]}
        onChange={(event) => {
          const kind = event.target.value;
          if (kind === 'all' || kind === 'journey' || kind === 'stay' || kind === 'event')
            onChange({ ...selection, kind });
        }}
      />
      <Select
        label="Journey window"
        className="min-h-11"
        value={selection.journey}
        options={[
          { value: '', label: 'All dates' },
          ...activeJourneys(snapshot).map(({ journey, timing }) => ({
            value: String(journey.id),
            label: journey.name ?? `Journey ${journey.id}`,
            disabled: timing.window === null,
          })),
        ]}
        onChange={(event) => onChange({ ...selection, journey: event.target.value })}
      />
    </div>
  );
}
