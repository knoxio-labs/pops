import {
  effectiveLocationId,
  locationPath,
  targetName,
} from '../../foundation/model/placement-model.js';

import type { ContainerFacts, PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { WebMovingGetResponse } from '../../inventory-api/types.gen.js';
import type { WebChangeGroup } from '../../inventory-web/useChangedElsewhere.js';

/** The response shape consumed by the moving-day page. */
export type MovingDayData = WebMovingGetResponse;

/** One moving box in the server aggregate. */
export type MovingBox = MovingDayData['boxes'][number];

/** One non-container item in a box, room, or hand. */
export type MovingThing = MovingBox['contents'][number];

/** One room group of loose things. */
export type MovingLooseGroup = MovingDayData['loose'][number];

/** The three packing stages exposed by the moving-day board. */
export type MovingBoxStage = MovingBox['stage'];

/** The three board modes plus the search result mode. */
export type MovingDayView = 'stage' | 'destination' | 'loose';

/** A board column grouped by destination. */
export interface MovingDestinationGroup {
  readonly optionKey: string | null;
  readonly label: string;
  readonly boxes: readonly MovingBox[];
  readonly closed: number;
}

/** A response summary with the fields used by the summary strip and done state. */
export type MovingSummary = Pick<
  MovingDayData,
  'boxes' | 'stages' | 'packed' | 'loose' | 'looseCount' | 'inHand' | 'unlabelledClosed'
>;

/** Stage order used by the board and its count strip. */
export const MOVING_BOX_STAGES: readonly MovingBoxStage[] = ['packing', 'full', 'closed'];

/** Converts the API placement union into the shared placement target model. */
export function movingPlacementTarget(placement: MovingBox['placement']): PlacementTarget {
  if (placement.kind === 'location') {
    return { kind: 'location', locationId: placement.locationId };
  }
  if (placement.kind === 'container') {
    return { kind: 'container', containerId: placement.itemId };
  }
  return { kind: 'in-hand' };
}

/** Converts a moving box stage into the shared container facts used by badges. */
export function containerFactsForBox(box: MovingBox): ContainerFacts {
  return {
    access: box.stage === 'closed' ? 'closed' : 'open',
    full: box.stage === 'full',
  };
}

/** Returns the shared display name for the box's current placement. */
export function movingPlacementName(world: PlacementWorld, box: MovingBox): string {
  return targetName(world, movingPlacementTarget(box.placement));
}

/** Returns all item IDs needed to make the placement picker complete for this response. */
export function movingItemIds(data: MovingDayData): readonly string[] {
  const ids = new Set<string>();
  for (const box of data.boxes) {
    ids.add(box.id);
    for (const item of box.contents) ids.add(item.id);
  }
  for (const group of data.loose) {
    for (const item of group.items) ids.add(item.id);
  }
  for (const item of data.inHand) ids.add(item.id);
  return [...ids];
}

/** Calculates the packed share as a whole-number percentage. */
export function packedPercent(summary: MovingSummary): number {
  const total = summary.packed + summary.looseCount + summary.inHand.length;
  return total === 0 ? 0 : Math.floor((summary.packed * 100) / total);
}

/** Returns whether every box is closed and no item remains loose in a room. */
export function isMoveDone(summary: MovingSummary): boolean {
  return (
    summary.boxes.length > 0 &&
    summary.looseCount === 0 &&
    summary.stages.closed === summary.boxes.length
  );
}

/** Groups boxes by stage while preserving empty columns and natural name order. */
export function boxesByStage(
  boxes: readonly MovingBox[]
): readonly { readonly stage: MovingBoxStage; readonly boxes: readonly MovingBox[] }[] {
  return MOVING_BOX_STAGES.map((stage) => ({
    stage,
    boxes: boxes
      .filter((box) => box.stage === stage)
      .toSorted((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true })),
  }));
}

/** Groups boxes in destination-option order and keeps an explicit undecided column. */
export function boxesByDestination(data: MovingDayData): readonly MovingDestinationGroup[] {
  const groups: MutableDestinationGroup[] = data.destinationOptions.map((option) => ({
    optionKey: option.optionKey,
    label: option.label,
    boxes: [],
    closed: 0,
  }));
  const byKey = new Map(groups.map((group) => [group.optionKey, group]));
  const unknown = new Map<string, MovingBox[]>();
  const undecided: MovingBox[] = [];

  for (const box of data.boxes) {
    const optionKey = box.destination?.optionKey ?? null;
    if (optionKey === null) {
      undecided.push(box);
      continue;
    }
    const known = byKey.get(optionKey);
    if (known !== undefined) {
      known.boxes.push(box);
      continue;
    }
    const boxesForUnknown = unknown.get(optionKey) ?? [];
    boxesForUnknown.push(box);
    unknown.set(optionKey, boxesForUnknown);
  }

  const configured = groups.map((group) => finishDestinationGroup(group));
  const unknownGroups = [...unknown.entries()].map(([optionKey, boxes]) =>
    finishDestinationGroup({
      optionKey,
      label:
        data.boxes.find((box) => box.destination?.optionKey === optionKey)?.destination?.label ??
        'Unknown destination',
      boxes,
      closed: 0,
    })
  );
  const result = [...configured, ...unknownGroups];
  if (undecided.length > 0) {
    result.push(
      finishDestinationGroup({
        optionKey: null,
        label: 'No destination',
        boxes: undecided,
        closed: 0,
      })
    );
  }
  return result;
}

interface MutableDestinationGroup {
  optionKey: string | null;
  label: string;
  boxes: MovingBox[];
  closed: number;
}

function finishDestinationGroup(group: MovingDestinationGroup): MovingDestinationGroup {
  const boxes = [...group.boxes].toSorted((left, right) =>
    left.name.localeCompare(right.name, undefined, { numeric: true })
  );
  return {
    ...group,
    boxes,
    closed: boxes.filter((box) => box.stage === 'closed').length,
  };
}

/** Finds the loose room represented by the box's effective location. */
export function looseGroupForBox(
  data: MovingDayData,
  world: PlacementWorld,
  box: MovingBox
): MovingLooseGroup | null {
  const locationId = locationIdForBox(world, box);
  if (locationId === null) return null;
  const path = locationPath(world, locationId);
  return data.loose.find((group) => path.some((location) => location.id === group.room.id)) ?? null;
}

function locationIdForBox(world: PlacementWorld, box: MovingBox): string | null {
  if (box.placement.kind === 'hand') return null;
  if (box.placement.kind === 'location') return box.placement.locationId;
  return effectiveLocationId(world, box.id);
}

/** Formats a stale banner title for the moving-day response. */
export function staleTitle(groups: readonly WebChangeGroup[]): string {
  if (groups.length === 1) return `${groups[0]?.actorLabel ?? 'Another device'} changed the move.`;
  return 'The move changed elsewhere.';
}

/** Formats the stale banner detail for the moving-day response. */
export function staleDetail(groups: readonly WebChangeGroup[]): string {
  const count = groups.reduce((total, group) => total + group.entityCount, 0);
  return `${count} ${count === 1 ? 'thing changed' : 'things changed'}. Reload to see them.`;
}
