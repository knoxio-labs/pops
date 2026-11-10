import type { JSX } from 'react';

import type { JourneyTiming } from './types';

/** Display only server-published chronology; unknown availability never becomes a safety claim. */
export function JourneyChronology({
  timing,
}: {
  timing: JourneyTiming | undefined;
}): JSX.Element | null {
  if (!timing) return null;
  return (
    <section aria-label="Journey timing" className="space-y-2 text-sm">
      {timing.findings.map((finding) => (
        <p
          key={finding.id}
          className="rounded-lg border border-destructive bg-destructive/10 p-3"
          role="status"
        >
          {messages[finding.code]} · {finding.legIds.map((id) => `Leg ${id}`).join(', ')}
        </p>
      ))}
      {timing.connections.map((connection) => (
        <p
          key={`${connection.previousLegId}:${connection.nextLegId}`}
          className="text-muted-foreground"
        >
          Leg {connection.previousLegId} → Leg {connection.nextLegId} ·{' '}
          {connection.availableMinutes === null
            ? 'Connection time unknown'
            : `${connection.availableMinutes} minutes between source clocks`}
        </p>
      ))}
    </section>
  );
}

const messages = {
  clock_unresolved: 'This local time and zone do not identify an unambiguous instant',
  arrival_before_departure: 'Arrival is before departure',
  departure_before_previous_arrival: 'Departure is before the previous arrival',
};
