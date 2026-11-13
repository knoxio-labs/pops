import { projectExploreSource } from './explore-model';
import { captureOrganisation } from './inbox-model';

import type { Place, Visit } from '../stay/types';
import type { CaptureSource } from './types';

/** Exact producer source identity; collection membership and numeric IDs are independent. */
export type CaptureTimelineSource = CaptureSource['memberships'][number]['source'];
/** Explicit presentation filters, with unknown location/organisation retained rather than guessed. */
export interface CaptureTimelineSelection {
  kind: 'all' | CaptureTimelineSource['kind'];
  organisation: 'all' | ReturnType<typeof captureOrganisation>;
  location: 'all' | 'unassigned' | { kind: 'place' | 'visit'; id: number };
}
/** Only classified exact Capture-domain references can be hidden; unobserved IDs remain visible. */
export interface CaptureTimelineVisibility {
  known: readonly CaptureTimelineSource[];
  visible: readonly CaptureTimelineSource[];
}

/** Derive visibility without changing source, route, booking or membership records. */
export function projectCaptureTimeline(
  source: CaptureSource,
  tripId: number,
  selection: CaptureTimelineSelection,
  context: {
    places: readonly Place[];
    visits: readonly Visit[];
    contactAvailability?: Parameters<typeof captureOrganisation>[2];
  }
): CaptureTimelineVisibility {
  const keys = new Map<string, CaptureTimelineSource>();
  const add = (key: CaptureTimelineSource): void => {
    keys.set(`${key.kind}:${key.id}`, key);
  };
  for (const row of source.captures)
    if (row.tripId === tripId && row.removedAt === null) add({ kind: 'capture', id: row.id });
  for (const row of source.ideas)
    if (row.tripId === tripId && row.removedAt === null) add({ kind: 'idea', id: row.id });
  for (const row of source.events) if (row.tripId === tripId) add({ kind: 'event', id: row.id });
  for (const row of source.memberships)
    if (row.tripId === tripId && row.removedAt === null) add(row.source);
  const known = [...keys.values()];
  const visible = known.filter((key) => {
    if (selection.kind !== 'all' && selection.kind !== key.kind) return false;
    const row = projectExploreSource(source, context.places, context.visits, key);
    if (row.unavailable) return true;
    if (key.kind === 'capture' && selection.organisation !== 'all') {
      const capture = source.captures.find((candidate) => candidate.id === key.id);
      if (
        capture &&
        captureOrganisation(capture, source, context.contactAvailability) !== selection.organisation
      )
        return false;
    }
    return matchesLocation(row.location, selection.location);
  });
  return { known, visible };
}

/** Unknown IDs and all non-Capture source kinds remain visible until explicitly classified. */
export function captureTimelineSourceVisible(
  visibility: CaptureTimelineVisibility | undefined,
  source: { kind: string; id: number }
): boolean {
  const same = (key: CaptureTimelineSource): boolean =>
    key.kind === source.kind && key.id === source.id;
  return !visibility?.known.some(same) || visibility.visible.some(same);
}

function matchesLocation(
  location: ReturnType<typeof projectExploreSource>['location'],
  selected: CaptureTimelineSelection['location']
): boolean {
  if (selected === 'all') return true;
  if (selected === 'unassigned') return location.kind === 'unassigned';
  if (location.kind === 'unassigned') return false;
  return (
    location.id === selected.id &&
    (location.kind === 'place' ? 'place' : location.kindOfReference) === selected.kind
  );
}

/** Keep literal location references selectable even when optional catalogue metadata disappears. */
export function timelineLocationOptions(
  rows: ReturnType<typeof projectExploreSource>[],
  selected: CaptureTimelineSelection['location'],
  label: (key: 'all' | 'unassigned') => string,
  referenceLabel: (kind: string, id: number) => string
): Map<string, { value: CaptureTimelineSelection['location']; label: string }> {
  const options = new Map<string, { value: CaptureTimelineSelection['location']; label: string }>([
    ['all', { value: 'all', label: label('all') }],
    ['unassigned', { value: 'unassigned', label: label('unassigned') }],
  ]);
  const add = (value: { kind: 'place' | 'visit'; id: number }): void => {
    options.set(JSON.stringify(value), { value, label: referenceLabel(value.kind, value.id) });
  };
  for (const row of rows) {
    if (row.unavailable || row.location.kind === 'unassigned') continue;
    const location = row.location;
    add({ kind: location.kind === 'place' ? 'place' : location.kindOfReference, id: location.id });
  }
  if (typeof selected !== 'string') add(selected);
  return options;
}
