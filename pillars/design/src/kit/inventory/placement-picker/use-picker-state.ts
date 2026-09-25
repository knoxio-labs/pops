/**
 * The placement picker's model (iOS parity #11): Put back first when there
 * is somewhere to go back to, then recent places, open containers, In hand,
 * and a drillable tree; typing searches every place and offers to create
 * the one that does not exist yet.
 */
import { useMemo, useState } from 'react';

import { rankMatch } from '../command-palette/palette-groups';
import { effectiveLocationId, locationPath, samePlacement } from '../shared/placement-model';
import { containerOption, locationOption, targetOption } from './picker-options';

import type { PickerSubject } from '../shared/contracts';
import type { ItemRowModel, PlacementTarget, PreviousPlacement } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';
import type { PickerOption } from './picker-options';

export type { PickerOption } from './picker-options';

/** What the picker is asked. */
export interface PickerInput {
  world: PlacementWorld;
  subject: PickerSubject;
  recents: readonly PlacementTarget[];
  canCreate: boolean;
}

/** Where the picker is: what is typed and which place it is drilled into. */
export interface PickerPosition {
  query: string;
  drillId: string | null;
}

/** Everything the picker renders. */
export interface PickerModel {
  putBack: PickerOption | null;
  /** The name of a previous place that has been deleted, so Put back cannot be offered. */
  putBackGone: string | null;
  recents: PickerOption[];
  openContainers: PickerOption[];
  inHand: PickerOption | null;
  crumbs: { id: string | null; name: string }[];
  level: PickerOption[];
  /** Search results; null while nothing is typed. */
  results: PickerOption[] | null;
  create: { name: string; parentId: string | null; parentName: string } | null;
}

const RECENT_LIMIT = 4;

function subjectItems(input: PickerInput): ItemRowModel[] {
  if (input.subject.kind === 'place') return [];
  return input.subject.ids.flatMap((id) => input.world.items.get(id) ?? []);
}

function activeContainers(world: PlacementWorld): ItemRowModel[] {
  return [...world.items.values()].filter(
    (entry) => entry.container !== null && entry.lifecycle === 'active'
  );
}

function samePrevious(a: PreviousPlacement, b: PreviousPlacement): boolean {
  if (a.kind === 'deleted' && b.kind === 'deleted') return a.name === b.name;
  if (a.kind === 'deleted' || b.kind === 'deleted') return false;
  return samePlacement(a, b);
}

function putBackOf(input: PickerInput): Pick<PickerModel, 'putBack' | 'putBackGone'> {
  const items = subjectItems(input);
  const first = items[0]?.previous ?? null;
  const shared =
    first !== null &&
    items.every(
      (entry) =>
        entry.placement.kind === 'in-hand' &&
        entry.previous !== null &&
        samePrevious(entry.previous, first)
    );
  if (!shared) return { putBack: null, putBackGone: null };
  if (first.kind === 'deleted') return { putBack: null, putBackGone: first.name };
  return { putBack: targetOption(input.world, input.subject, first), putBackGone: null };
}

function levelOf(input: PickerInput, drillId: string | null): PickerOption[] {
  const { world, subject } = input;
  const places = [...world.locations.values()]
    .filter((node) => node.parentId === drillId)
    .map((node) => locationOption(world, subject, node));
  if (subject.kind === 'place' || drillId === null) return places;
  const boxes = activeContainers(world)
    .filter(
      (entry) => entry.placement.kind === 'location' && entry.placement.locationId === drillId
    )
    .map((entry) => containerOption(world, subject, entry));
  return [...places, ...boxes];
}

function resultsOf(input: PickerInput, query: string): PickerOption[] {
  const { world, subject } = input;
  const places = [...world.locations.values()].map((node) => locationOption(world, subject, node));
  const boxes =
    subject.kind === 'place'
      ? []
      : activeContainers(world).map((entry) => containerOption(world, subject, entry));
  return [...places, ...boxes]
    .map((option, index) => ({
      option,
      index,
      rank: rankMatch(query, option.label, [option.detail]),
    }))
    .filter((scored) => scored.rank > 0)
    .toSorted((a, b) => b.rank - a.rank || a.index - b.index)
    .slice(0, 8)
    .map((scored) => scored.option);
}

function createOf(input: PickerInput, position: PickerPosition): PickerModel['create'] {
  const name = position.query.trim();
  if (!input.canCreate || name === '') return null;
  const exists = [...input.world.locations.values()].some(
    (node) => node.name.toLowerCase() === name.toLowerCase()
  );
  if (exists) return null;
  const parent =
    position.drillId === null ? undefined : input.world.locations.get(position.drillId);
  return { name, parentId: parent?.id ?? null, parentName: parent?.name ?? 'the top level' };
}

function inRecents(input: PickerInput, containerId: string): boolean {
  return input.recents
    .slice(0, RECENT_LIMIT)
    .some((target) => target.kind === 'container' && target.containerId === containerId);
}

function rememberedLocationId(input: PickerInput): string | null {
  const first = subjectItems(input)[0];
  if (first === undefined) return null;
  const spot = first.placement.kind === 'in-hand' ? first.previous : first.placement;
  if (spot === null || spot.kind === 'deleted') return null;
  return spot.kind === 'location'
    ? spot.locationId
    : effectiveLocationId(input.world, spot.containerId);
}

/**
 * Where the tree opens: the room that holds the subject now, or held it
 * last when it is in hand, so the likely targets are one glance away.
 * A place being moved opens at its own parent.
 */
export function defaultDrill(input: PickerInput): string | null {
  const { world, subject } = input;
  if (subject.kind === 'place') return world.locations.get(subject.locationId)?.parentId ?? null;
  const locationId = rememberedLocationId(input);
  if (locationId === null) return null;
  const path = locationPath(world, locationId);
  return (path[1] ?? path[0])?.id ?? null;
}

/** Derives everything the picker shows for one input and position. */
export function derivePicker(input: PickerInput, position: PickerPosition): PickerModel {
  const { world, subject } = input;
  const itemsMode = subject.kind === 'items';
  const everyInHand = subjectItems(input).every((entry) => entry.placement.kind === 'in-hand');
  const crumbs = [
    { id: null, name: 'All places' },
    ...(position.drillId === null
      ? []
      : locationPath(world, position.drillId).map((node) => ({ id: node.id, name: node.name }))),
  ];
  const query = position.query.trim();
  return {
    ...(itemsMode ? putBackOf(input) : { putBack: null, putBackGone: null }),
    recents: itemsMode
      ? input.recents
          .slice(0, RECENT_LIMIT)
          .flatMap((target) => targetOption(world, subject, target) ?? [])
      : [],
    openContainers: itemsMode
      ? activeContainers(world)
          .filter((entry) => entry.container?.access === 'open' && !inRecents(input, entry.id))
          .slice(0, 5)
          .map((entry) => containerOption(world, subject, entry))
      : [],
    inHand: itemsMode && !everyInHand ? targetOption(world, subject, { kind: 'in-hand' }) : null,
    crumbs,
    level: levelOf(input, position.drillId),
    results: query === '' ? null : resultsOf(input, query),
    create: createOf(input, position),
  };
}

/** What {@link usePickerState} hands the picker component. */
export interface PickerApi {
  position: PickerPosition;
  model: PickerModel;
  setQuery: (query: string) => void;
  drillInto: (locationId: string | null) => void;
}

/** The picker model bound to live query and drill state. */
export function usePickerState(
  input: PickerInput,
  initial: Partial<PickerPosition> = {}
): PickerApi {
  const [query, setQuery] = useState(initial.query ?? '');
  const [drillId, setDrillId] = useState<string | null>(() =>
    initial.drillId === undefined ? defaultDrill(input) : initial.drillId
  );
  const model = useMemo(() => derivePicker(input, { query, drillId }), [input, query, drillId]);
  return {
    position: { query, drillId },
    model,
    setQuery,
    drillInto: (locationId) => {
      setDrillId(locationId);
      setQuery('');
    },
  };
}
