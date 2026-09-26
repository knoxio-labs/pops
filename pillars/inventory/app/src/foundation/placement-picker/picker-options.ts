import { isLocationWithin, locationPath, placementTrail } from '../model/placement-model';
import { dropVerdict } from '../move-plan/move-plan-model';

import type { PickerSubject } from '../model/contracts';
import type { ItemRowModel, LocationKind, LocationModel, PlacementTarget } from '../model/model';
import type { PathSegment, PlacementWorld } from '../model/placement-model';

/** One destination row shown by the placement picker. */
export interface PickerOption {
  key: string;
  target: PlacementTarget;
  label: string;
  /** The resolved path that disambiguates duplicate place names. */
  detail: string;
  kind: 'location' | 'container' | 'in-hand';
  locationKind?: LocationKind;
  access?: 'open' | 'closed';
  full?: boolean;
  /** Whether the row has a separate control for browsing its children. */
  drillable: boolean;
  /** Why this destination cannot be used, or `null` when it can be picked. */
  disabledReason: string | null;
}

function joinPath(world: PlacementWorld, segments: readonly PathSegment[]): string {
  const first = segments[0];
  const isPropertyRoot =
    segments.length > 1 && first?.id !== null && first?.id !== undefined
      ? world.locations.get(first.id)?.kind === 'property'
      : false;
  return (isPropertyRoot ? segments.slice(1) : segments).map((segment) => segment.name).join(' › ');
}

function reasonFor(
  world: PlacementWorld,
  subject: PickerSubject,
  target: PlacementTarget
): string | null {
  if (subject.kind === 'place') {
    if (target.kind !== 'location') return 'A place can only go inside another place.';
    if (isLocationWithin(world, target.locationId, subject.locationId)) {
      return 'A place cannot go inside itself.';
    }
    const parentId = world.locations.get(subject.locationId)?.parentId ?? null;
    return parentId === target.locationId ? 'Already here.' : null;
  }

  const verdict = dropVerdict(world, subject.ids, target);
  return verdict.ok ? null : verdict.reason;
}

function hasInside(world: PlacementWorld, locationId: string): boolean {
  const hasChildPlace = [...world.locations.values()].some((node) => node.parentId === locationId);
  if (hasChildPlace) return true;
  return [...world.items.values()].some(
    (entry) =>
      entry.container !== null &&
      entry.lifecycle === 'active' &&
      entry.placement.kind === 'location' &&
      entry.placement.locationId === locationId
  );
}

/** Builds a picker row for a location. */
export function locationOption(
  world: PlacementWorld,
  subject: PickerSubject,
  node: LocationModel
): PickerOption {
  const target: PlacementTarget = { kind: 'location', locationId: node.id };
  return {
    key: `loc:${node.id}`,
    target,
    label: node.name,
    detail: joinPath(
      world,
      locationPath(world, node.id)
        .slice(0, -1)
        .map((segment) => ({ kind: 'location' as const, id: segment.id, name: segment.name }))
    ),
    kind: 'location',
    locationKind: node.kind,
    drillable:
      hasInside(world, node.id) &&
      !(subject.kind === 'place' && isLocationWithin(world, node.id, subject.locationId)),
    disabledReason: reasonFor(world, subject, target),
  };
}

/** Builds a picker row for a container. */
export function containerOption(
  world: PlacementWorld,
  subject: PickerSubject,
  box: ItemRowModel
): PickerOption {
  const target: PlacementTarget = { kind: 'container', containerId: box.id };
  return {
    key: `box:${box.id}`,
    target,
    label: box.name,
    detail: joinPath(world, placementTrail(world, box.placement)),
    kind: 'container',
    access: box.container?.access,
    full: box.container?.full,
    drillable: false,
    disabledReason: reasonFor(world, subject, target),
  };
}

/** Resolves a target to a picker row, or `null` when its source record is gone. */
export function targetOption(
  world: PlacementWorld,
  subject: PickerSubject,
  target: PlacementTarget
): PickerOption | null {
  if (target.kind === 'in-hand') {
    return {
      key: 'hand',
      target,
      label: 'In hand',
      detail: 'Carry it until it has a place',
      kind: 'in-hand',
      drillable: false,
      disabledReason: reasonFor(world, subject, target),
    };
  }

  if (target.kind === 'location') {
    const node = world.locations.get(target.locationId);
    return node === undefined ? null : locationOption(world, subject, node);
  }

  const box = world.items.get(target.containerId);
  return box === undefined || box.container === null ? null : containerOption(world, subject, box);
}
