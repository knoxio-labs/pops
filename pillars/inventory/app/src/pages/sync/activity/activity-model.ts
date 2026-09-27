import type { EventActor, EventKind, EventModel } from '../../../foundation/model/model.js';
import type { WebEvent } from '../../../inventory-web/useWebEvents.js';

export { formatWhen } from './when.js';

/** A group of server events shown by one Activity kind filter. */
export type KindGroup = 'all' | 'placement' | 'containers' | 'edits' | 'lifecycle' | 'created';

/** The kind group used by each normalized history event. */
export const KIND_GROUP: Readonly<Record<EventKind, Exclude<KindGroup, 'all'>>> = {
  created: 'created',
  moved: 'placement',
  'picked-up': 'placement',
  'put-back': 'placement',
  opened: 'containers',
  closed: 'containers',
  'field-changed': 'edits',
  'type-set': 'edits',
  'code-set': 'edits',
  'quantity-changed': 'edits',
  split: 'edits',
  retired: 'lifecycle',
  discarded: 'lifecycle',
  lost: 'lifecycle',
  destroyed: 'lifecycle',
  restored: 'lifecycle',
  'photo-added': 'edits',
  connected: 'edits',
};

/** The server kinds requested when a user selects an Activity group. */
export const SERVER_KIND_GROUPS: Readonly<Record<Exclude<KindGroup, 'all'>, readonly string[]>> = {
  placement: ['moved', 'stored', 'picked_up', 'put_back'],
  containers: ['opened', 'closed'],
  edits: [
    'edited',
    'code_set',
    'type_changed',
    'quantity_changed',
    'split_from',
    'split_into',
    'photo_added',
    'photo_removed',
    'override_set',
    'override_cleared',
  ],
  lifecycle: ['lifecycle_changed', 'restored'],
  created: ['created'],
};

/** The labels and display order of the Activity kind filters. */
export const KIND_GROUP_LABELS: ReadonlyArray<{ id: KindGroup; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'placement', label: 'Moves' },
  { id: 'containers', label: 'Open and close' },
  { id: 'edits', label: 'Edits' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'created', label: 'Added' },
];

/** The normalized filter state used by the Activity list and URL. */
export interface ActivityFilter {
  readonly group: KindGroup;
  readonly actor: EventActor | 'anyone';
  readonly query: string;
  readonly from: string;
  readonly to: string;
}

/** The unfiltered Activity state. */
export const NO_FILTER: ActivityFilter = {
  group: 'all',
  actor: 'anyone',
  query: '',
  from: '',
  to: '',
};

/** One changed field prepared for safe rendering in the detail sheet. */
export interface ActivityChangedField {
  readonly name: string;
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

const ACTORS: ReadonlySet<string> = new Set(['anyone', 'device', 'web', 'service', 'migration']);
const GROUPS: ReadonlySet<string> = new Set([
  'all',
  'placement',
  'containers',
  'edits',
  'lifecycle',
  'created',
]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/** Returns whether a URL value is a supported Activity kind group. */
export function isKindGroup(value: string | null): value is KindGroup {
  return value !== null && GROUPS.has(value);
}

/** Returns whether a URL value is a supported Activity actor filter. */
export function isActivityActor(value: string | null): value is EventActor | 'anyone' {
  return value !== null && ACTORS.has(value);
}

function validDate(value: string | null): string {
  if (value === null || !DATE_PATTERN.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? '' : value;
}

/** Reads the Activity-owned filters from URL parameters, using safe defaults. */
export function parseActivityFilter(params: URLSearchParams): ActivityFilter {
  const from = validDate(params.get('from'));
  const requestedTo = validDate(params.get('to'));
  const to = from !== '' && requestedTo !== '' && requestedTo < from ? from : requestedTo;
  const requestedGroup = params.get('kind');
  const requestedActor = params.get('actor');
  return {
    group: isKindGroup(requestedGroup) ? requestedGroup : 'all',
    actor: isActivityActor(requestedActor) ? requestedActor : 'anyone',
    query: params.get('q') ?? '',
    from,
    to,
  };
}

function setParam(params: URLSearchParams, key: string, value: string, fallback: string): void {
  if (value === fallback || value.trim() === '') params.delete(key);
  else params.set(key, value);
}

/** Writes Activity-owned filters while preserving unrelated route parameters. */
export function writeActivityFilter(
  current: URLSearchParams,
  filter: ActivityFilter
): URLSearchParams {
  const next = new URLSearchParams(current);
  setParam(next, 'kind', filter.group, 'all');
  setParam(next, 'actor', filter.actor, 'anyone');
  setParam(next, 'q', filter.query, '');
  setParam(next, 'from', filter.from, '');
  setParam(next, 'to', filter.to, '');
  return next;
}

/** Returns whether any Activity filter narrows the visible event list. */
export function isFiltered(filter: ActivityFilter): boolean {
  return (
    filter.group !== 'all' ||
    filter.actor !== 'anyone' ||
    filter.query.trim() !== '' ||
    filter.from !== '' ||
    filter.to !== ''
  );
}

function eventDate(event: EventModel): string | null {
  const parsed = new Date(event.at);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function matchesDate(event: EventModel, filter: ActivityFilter): boolean {
  const date = eventDate(event);
  if (date === null) return filter.from === '' && filter.to === '';
  return (filter.from === '' || date >= filter.from) && (filter.to === '' || date <= filter.to);
}

function matchesQuery(event: EventModel, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [event.itemName, event.summary, event.actorName, event.reason ?? ''].some((value) =>
    value.toLowerCase().includes(needle)
  );
}

/** Returns the events kept by all Activity filters, preserving feed order. */
export function filterEvents(events: readonly EventModel[], filter: ActivityFilter): EventModel[] {
  return events.filter(
    (event) =>
      (filter.group === 'all' || KIND_GROUP[event.kind] === filter.group) &&
      (filter.actor === 'anyone' || event.actor === filter.actor) &&
      matchesQuery(event, filter.query) &&
      matchesDate(event, filter)
  );
}

/** Counts normalized events under every kind filter, independent of active filters. */
export function groupCounts(events: readonly EventModel[]): Record<KindGroup, number> {
  const counts: Record<KindGroup, number> = {
    all: events.length,
    placement: 0,
    containers: 0,
    edits: 0,
    lifecycle: 0,
    created: 0,
  };
  for (const event of events) counts[KIND_GROUP[event.kind]] += 1;
  return counts;
}

/** Converts an event value into text without coercing objects to `[object Object]`. */
export function safeEventValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? '—';
  } catch {
    return 'Unavailable';
  }
}

/** Humanizes a wire field name for the event detail sheet. */
export function eventFieldLabel(field: string): string {
  const spaced = field.replaceAll('_', ' ').replaceAll(/([a-z])([A-Z])/gu, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Returns each wire field's before and after values in a safe display shape. */
export function changedFields(event: WebEvent): ActivityChangedField[] {
  return [...new Set(event.fields)].map((name) => ({
    name,
    label: eventFieldLabel(name),
    before: safeEventValue(event.before[name]),
    after: safeEventValue(event.after[name]),
  }));
}
