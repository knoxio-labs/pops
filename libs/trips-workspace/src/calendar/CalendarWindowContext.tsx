import type { JSX } from 'react';

import type { CalendarSelection, CalendarSnapshot } from './types';

/** Present the explicit display zone and selected canonical window; callers must first validate the selection. */
export function CalendarWindowContext({
  snapshot,
  selection,
}: {
  snapshot: CalendarSnapshot;
  selection: CalendarSelection;
}): JSX.Element {
  const window = snapshot.journeys.find(({ journey }) => String(journey.id) === selection.journey)
    ?.timing.window;
  return (
    <p className="text-xs text-muted-foreground">
      Display zone: {selection.zone}
      {window ? ` · Journey window: ${window.from} → ${window.toExclusive} (exclusive)` : ''}
    </p>
  );
}
