import { useState, useSyncExternalStore } from 'react';

import { Select } from '@pops/ui';

import { projectExploreRows } from './explore-model';
import { ExploreSourceRow } from './ExploreSourceRow';

import type { JSX } from 'react';

import type { Place } from '../stay/types';
import type { CaptureBrowserSession } from './browser-session';
import type { ExploreRow } from './explore-model';
import type { CaptureWorkspaceProps } from './types';
import type { CaptureContext } from './use-capture-context';

/** Explore groups its actual source records by recorded identities; removing membership retains the source. */
export function CaptureExplore({
  session,
  context,
  onViewEvent,
  documentsClient,
}: {
  session: CaptureBrowserSession;
  context: CaptureContext;
  onViewEvent?: (eventId: number) => void;
  documentsClient?: CaptureWorkspaceProps['documentsClient'];
}): JSX.Element {
  const state = useSyncExternalStore(
    session.editor.subscribe,
    session.editor.getState,
    session.editor.getState
  );
  const [filter, setFilter] = useState('all');
  const rows = projectExploreRows(
    state.source,
    context.places.data ?? [],
    context.visits.data ?? []
  ).filter((row) => filter === 'all' || row.source.kind === filter);
  const groups = groupExploreRows(rows, context.places.data ?? []);
  return (
    <section aria-label="Explore sources" className="space-y-4">
      <Select
        label="Explore filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        options={[
          { value: 'all', label: 'All sources' },
          { value: 'capture', label: 'Captures' },
          { value: 'idea', label: 'Ideas' },
          { value: 'event', label: 'Events' },
        ]}
      />
      {groups.size === 0 ? (
        <p className="text-muted-foreground">No saved possibilities.</p>
      ) : (
        [...groups].map(([key, group]) => (
          <section aria-label={group.label} key={key} className="space-y-3">
            <h2 className="font-semibold">{group.label}</h2>
            {group.rows.map((row) => (
              <ExploreSourceRow
                key={row.membershipId}
                row={row}
                session={session}
                busy={state.busy}
                context={context}
                onViewEvent={onViewEvent}
                documentsClient={documentsClient}
              />
            ))}
          </section>
        ))
      )}
    </section>
  );
}
function locationLabel(location: ExploreRow['location'], places: Place[]): string {
  if (location.kind === 'unassigned') return 'Unassigned';
  if (location.kind === 'unavailable')
    return `Unavailable ${location.kindOfReference} ${location.id}`;
  return `${places.find((place) => place.id === location.id)?.name ?? 'Unavailable place'} · ${location.id}`;
}

function groupExploreRows(
  rows: ExploreRow[],
  places: Place[]
): Map<string, { label: string; rows: ExploreRow[] }> {
  const groups = new Map<string, { label: string; rows: ExploreRow[] }>();
  for (const row of rows) {
    const key = JSON.stringify(row.location);
    const group = groups.get(key) ?? {
      label: locationLabel(row.location, places),
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }
  return groups;
}
