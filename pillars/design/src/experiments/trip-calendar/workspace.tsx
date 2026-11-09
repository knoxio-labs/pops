import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

import { CalendarControls } from './controls';
import { createTripCalendarState } from './fixtures';
import { calendarDate } from './format';
import {
  calendarInputFindings,
  tripCalendarDays,
  tripCalendarFindings,
  validCalendarAvailability,
} from './model';
import { CalendarReview } from './review';
import { CalendarAvailabilityRow, CalendarBookingRow } from './rows';
import { AvailabilitySource, BookingSource } from './source';

import type { CalendarDay, CalendarScenario, TripCalendarState } from './model';

/** Projects explicit calendar inputs into a compact agenda or a separate display-clock rail. */
export function TripCalendarWorkspace({
  layout,
  scenario = 'default',
}: {
  layout: 'agenda' | 'timeline';
  scenario?: CalendarScenario;
}) {
  const [state, change] = useState(() => createTripCalendarState(scenario));
  const [selected, select] = useState('');
  const inputFindings = calendarInputFindings(state);
  const days = tripCalendarDays(state);
  const hasEntries = days.some((day) => day.entries.length || day.availability.length);
  return (
    <>
      <CalendarReview layout={layout} />
      <main className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
        <header className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold">Trip calendar</h1>
        </header>
        <CalendarControls state={state} change={change} selected={selected} select={select} />
        {inputFindings.map((finding) => (
          <p key={finding.id} role="alert" className="text-sm text-destructive">
            {finding.message}
          </p>
        ))}
        <CalendarTimingFindings state={state} />
        {!hasEntries && !inputFindings.length && (
          <p role="status" className="text-sm text-muted-foreground">
            No entries in this range
          </p>
        )}
        {hasEntries && (
          <section aria-label="Calendar results" className="space-y-6">
            {days.map((day) => (
              <CalendarDaySection key={day.day} day={day} layout={layout} />
            ))}
          </section>
        )}
      </main>
    </>
  );
}

function CalendarDaySection({ day, layout }: { day: CalendarDay; layout: 'agenda' | 'timeline' }) {
  if (!day.entries.length && !day.availability.length) return null;
  return (
    <section aria-label={day.day} className="space-y-3">
      <h2 className="border-b border-foreground/20 pb-2 text-base font-semibold">
        {calendarDate(day.day)}
      </h2>
      <div className={layout === 'agenda' ? 'space-y-3' : ''}>
        {day.availability.map((availability) => (
          <CalendarAvailabilityRow
            key={availability.id}
            availability={availability}
            layout={layout}
          />
        ))}
        {day.entries.map((entry) => (
          <CalendarBookingRow
            key={`${entry.booking.id}-${entry.boundary}`}
            entry={entry}
            layout={layout}
          />
        ))}
      </div>
    </section>
  );
}

function CalendarTimingFindings({ state }: { state: TripCalendarState }) {
  const findings = tripCalendarFindings(state);
  if (!findings.length) return null;
  const sourceIds = new Set(findings.flatMap((finding) => finding.recordIds));
  return (
    <section
      aria-label="Timing findings"
      className="space-y-2 rounded-xl border border-destructive/60 bg-destructive/10 p-3"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="size-4 text-destructive" aria-hidden />
        Timing issues
      </h2>
      {findings.map((finding) => (
        <p key={finding.id} className="text-sm">
          {finding.message}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        {state.bookings
          .filter((booking) => sourceIds.has(booking.recordId))
          .map((booking) => (
            <BookingSource key={booking.id} booking={booking} />
          ))}
        {(state.kind === 'all' || state.kind === 'availability') &&
          state.availability
            .filter((source) => !validCalendarAvailability(source))
            .map((source) => <AvailabilitySource key={source.id} availability={source} />)}
      </div>
    </section>
  );
}
