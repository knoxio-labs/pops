import { formatWireValue } from '../catalogue-editor/computed/preview-model.js';

import type { EventActor, EventKind, EventModel } from '../foundation/model/model.js';
import type { PlacementWorld } from '../foundation/model/placement-model.js';
import type { WebEvent } from './useWebEvents.js';

type Values = WebEvent['before'];
type Placement = NonNullable<Values['placement']>;
type Lines = { readonly before: string | null; readonly after: string | null };
type Names = ReadonlyMap<string, string>;
type Reader = (event: WebEvent, world: PlacementWorld, names: Names) => string;
type ValueReader = (event: WebEvent, world: PlacementWorld, names: Names) => Lines;

const ACTORS: ReadonlySet<string> = new Set('device web service migration'.split(' '));
const MODEL_KIND =
  /^(created|moved|picked-up|put-back|opened|closed|field-changed|type-set|code-set|quantity-changed|split|retired|discarded|lost|destroyed|restored|photo-added)$/u;
const INACTIVE: ReadonlySet<string> = new Set('retired discarded lost destroyed'.split(' '));
const FIELD_KINDS = new Set('override_set override_cleared reverted deleted'.split(' '));
const EMPTY_LINES: Lines = { before: null, after: null };

const isActor = (value: string): value is EventActor => ACTORS.has(value);
const isModelKind = (value: string): value is EventKind => MODEL_KIND.test(value);
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const photoCount = (value: unknown): number | null => (Array.isArray(value) ? value.length : null);
const life = (values: Values): string | null => text(values.lifecycle);
const inactive = (value: string): value is EventKind => INACTIVE.has(value);

const scalar = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? formatWireValue(value)
    : null;
const cap = (value: string | null): string =>
  value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Unknown';
const human = (value: string): string => cap(value.replaceAll(/(?<=[a-z])(?=[A-Z])|[_-]+/g, ' '));
function place(world: PlacementWorld, placement: Placement | undefined): string | null {
  if (placement === undefined) return null;
  if (placement.kind === 'hand') return 'In hand';
  if (placement.kind === 'location')
    return world.locations.get(placement.locationId)?.name ?? 'Unknown place';
  return world.items.get(placement.itemId)?.name ?? 'Unknown container';
}
const placeOr = (w: PlacementWorld, p: Placement | undefined, f: string): string =>
  place(w, p) ?? f;
const oneField = (event: WebEvent): string | null =>
  event.fields.length === 1 ? (event.fields[0] ?? null) : null;
const typeName = (v: Values, n: Names): string | null =>
  typeof v.typeId !== 'string' ? text(v.typeKey) : (n.get(v.typeId) ?? text(v.typeKey));
const full = (v: unknown): string | null =>
  ({ true: 'Full', false: 'Not full' })[String(v)] ?? null;

function simpleKind(kind: string): EventKind {
  if (kind === 'stored') return 'moved';
  if (kind === 'type_changed') return 'type-set';
  if (kind === 'split_from' || kind === 'split_into') return 'split';
  if (kind === 'photo_removed' || FIELD_KINDS.has(kind)) return 'field-changed';
  const candidate = kind.replace('_', '-');
  return isModelKind(candidate) ? candidate : 'field-changed';
}
function editedKind(event: WebEvent): EventKind {
  return oneField(event) === 'photos' && photoSummary(event) === 'Photo added'
    ? 'photo-added'
    : 'field-changed';
}
function lifecycleKind(event: WebEvent): EventKind {
  const value = life(event.after);
  if (value === 'active') return 'restored';
  return value !== null && inactive(value) ? value : 'field-changed';
}

function photoSummary(event: WebEvent): string {
  const before = photoCount(event.before.photos);
  const after = photoCount(event.after.photos);
  if (before !== null && after !== null && after > before) return 'Photo added';
  if (before !== null && after !== null && after < before) return 'Photo removed';
  return 'Photos reordered';
}
function editedSummary(event: WebEvent): string {
  const field = oneField(event);
  if (field === 'name') return `Renamed to ${text(event.after.name) ?? 'Unknown'}`;
  if (field === 'isFull') {
    const value = full(event.after.isFull);
    if (value === 'Full') return 'Marked full';
    if (value === 'Not full') return 'Marked not full';
    return 'Edited';
  }
  if (field === 'photos') return photoSummary(event);
  if (field === 'replacementValue') return 'Replacement value changed';
  return field === null ? 'Edited' : `${human(field)} changed`;
}
function lifecycleSummary(event: WebEvent): string {
  const value = life(event.after);
  if (value === 'active') return `Restored from ${cap(life(event.before))}`;
  if (value === 'lost') return 'Marked lost';
  return value !== null && inactive(value) ? cap(value) : 'Lifecycle changed';
}
function moveSummary(event: WebEvent, world: PlacementWorld): string {
  const target = event.after.placement;
  if (event.kind === 'moved' && target?.kind === 'hand') return 'Moved in hand';
  if (event.kind === 'moved' && target?.kind === 'container')
    return `Moved into ${placeOr(world, target, 'Unknown container')}`;
  return `${event.kind === 'stored' ? 'Stored in' : 'Moved to'} ${placeOr(world, target, 'Unknown place')}`;
}
function quantitySummary(event: WebEvent): string {
  const before = num(event.before.quantity);
  const after = num(event.after.quantity);
  return before === null || after === null ? 'Quantity changed' : `Quantity ${before} to ${after}`;
}
function splitSummary(event: WebEvent): string {
  const before = num(event.before.quantity);
  const after = num(event.after.quantity);
  return before === null || after === null
    ? 'Split into a new item'
    : `Split ${before - after} into a new item`;
}
const codeSummary = (event: WebEvent): string =>
  text(event.after.code) === null ? 'Code cleared' : `Code set to ${text(event.after.code)}`;
const pickupSummary = (event: WebEvent, world: PlacementWorld): string => {
  const source = place(world, event.before.placement);
  return source === null ? 'Picked up. It had no place yet' : `Picked up from ${source}`;
};
const typeSummary = (event: WebEvent, _world: PlacementWorld, names: Names): string =>
  `Type set to ${typeName(event.after, names) ?? 'Unknown type'}`;

const SUMMARY_READERS: Readonly<Partial<Record<string, Reader>>> = {
  moved: moveSummary,
  stored: moveSummary,
  picked_up: pickupSummary,
  put_back: (event, world) =>
    `Put back on ${placeOr(world, event.after.placement, 'Unknown place')}`,
  edited: editedSummary,
  code_set: codeSummary,
  type_changed: typeSummary,
  quantity_changed: quantitySummary,
  split_from: splitSummary,
  lifecycle_changed: lifecycleSummary,
};

const pair = (event: WebEvent, field: string): Lines => ({
  before: scalar(event.before[field]),
  after: scalar(event.after[field]),
});
const placementValues = (event: WebEvent, world: PlacementWorld): Lines => ({
  before: place(world, event.before.placement),
  after: place(world, event.after.placement),
});
function editedValues(event: WebEvent): Lines {
  const field = oneField(event);
  if (field === 'name') return { before: text(event.before.name), after: text(event.after.name) };
  if (field === 'isFull')
    return { before: full(event.before.isFull), after: full(event.after.isFull) };
  return field === null || field === 'photos' ? EMPTY_LINES : pair(event, field);
}
function lifecycleValues(event: WebEvent): Lines {
  const kind = lifecycleKind(event);
  if (kind === 'field-changed') return EMPTY_LINES;
  const after = kind === 'restored' ? 'Active' : cap(life(event.after));
  return { before: cap(life(event.before)), after };
}

const VALUE_READERS: Readonly<Partial<Record<string, ValueReader>>> = {
  moved: placementValues,
  stored: placementValues,
  picked_up: (event, world) => ({ before: place(world, event.before.placement), after: 'In hand' }),
  put_back: (event, world) => ({ before: 'In hand', after: place(world, event.after.placement) }),
  opened: () => ({ before: 'Closed', after: 'Open' }),
  closed: () => ({ before: 'Open', after: 'Closed' }),
  edited: editedValues,
  code_set: (event) => ({ before: text(event.before.code), after: text(event.after.code) }),
  type_changed: (event, _world, names) => ({
    before: typeName(event.before, names),
    after: typeName(event.after, names),
  }),
  quantity_changed: (event) => pair(event, 'quantity'),
  split_from: (event) => pair(event, 'quantity'),
  split_into: (event) => pair(event, 'quantity'),
  lifecycle_changed: lifecycleValues,
};

/** Server kind to the shared history kind; unknown kinds read as `field-changed`. */
export function eventKindOf(event: WebEvent): EventKind {
  if (event.kind === 'edited') return editedKind(event);
  if (event.kind === 'lifecycle_changed') return lifecycleKind(event);
  return simpleKind(event.kind);
}
/** Maps the wire actor kind to the shared actor kind, defaulting unknown values to `service`. */
export function eventActorOf(event: WebEvent): EventActor {
  return isActor(event.actor.kind) ? event.actor.kind : 'service';
}
/** Builds the one-line history summary, resolving placement and catalogue names from local models. */
export function eventSummary(event: WebEvent, world: PlacementWorld, names: Names): string {
  return SUMMARY_READERS[event.kind]?.(event, world, names) ?? human(event.kind);
}
/** Builds the Before and After detail lines for a server event; unsupported values return null. */
export function eventValues(event: WebEvent, world: PlacementWorld, names: Names): Lines {
  return VALUE_READERS[event.kind]?.(event, world, names) ?? EMPTY_LINES;
}
/** Converts one server event into the shared history model consumed by Overview and item history. */
export function toEventModel(event: WebEvent, world: PlacementWorld, names: Names): EventModel {
  const values = eventValues(event, world, names);
  return {
    id: String(event.seq),
    itemId: event.entityId,
    itemName: event.entityName,
    kind: eventKindOf(event),
    at: event.serverTime,
    actor: eventActorOf(event),
    actorName: event.actor.label,
    summary: eventSummary(event, world, names),
    before: values.before,
    after: values.after,
    reason: event.reason,
    undoable: event.undoable && event.compensatesSeq === null,
  };
}
