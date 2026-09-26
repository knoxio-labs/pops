/**
 * What a bulk move or a drop would actually do, computed before anything is
 * pressed. A move carries contents with it, so the count a person needs is
 * never simply the number of rows they ticked.
 */
import { deepContents, isWithin, samePlacement, targetName } from '../model/placement-model';

import type { ItemRowModel, PlacementTarget } from '../model/model';
import type { PlacementWorld } from '../model/placement-model';

/** One selected item that will not move, and the literal reason. */
export interface MoveBlocker {
  itemId: string;
  itemName: string;
  reason: string;
}

/** Why the target itself refuses the whole move, if it does. */
export type TargetRefusal = 'closed' | 'inactive' | 'missing' | null;

/** The computed outcome of moving a selection to one target. */
export interface MovePlan {
  target: PlacementTarget;
  targetName: string;
  /** Selected items that will move, in selection order. */
  moving: ItemRowModel[];
  /** Items riding along inside a moving container, not selected themselves. */
  carried: ItemRowModel[];
  /** Selected items already at the target: nothing happens to them. */
  alreadyThere: ItemRowModel[];
  blocked: MoveBlocker[];
  targetRefusal: TargetRefusal;
  /** The target is marked full. Full is a person's note, not a refusal. */
  targetFull: boolean;
}

/** Input to {@link planMove}. */
export interface MovePlanInput {
  world: PlacementWorld;
  selectedIds: readonly string[];
  target: PlacementTarget;
}

function refusalFor(world: PlacementWorld, target: PlacementTarget): TargetRefusal {
  if (target.kind === 'in-hand') return null;
  if (target.kind === 'location') return world.locations.has(target.locationId) ? null : 'missing';
  const box = world.items.get(target.containerId);
  if (box === undefined || box.container === null) return 'missing';
  if (box.lifecycle !== 'active') return 'inactive';
  return box.container.access === 'closed' ? 'closed' : null;
}

function blockReason(
  world: PlacementWorld,
  item: ItemRowModel,
  target: PlacementTarget
): string | null {
  if (item.lifecycle === 'destroyed') return 'Destroyed. It has no place any more.';
  if (item.lifecycle === 'discarded' || item.lifecycle === 'lost') {
    return `${item.lifecycle === 'lost' ? 'Lost' : 'Discarded'}. Restore it first.`;
  }
  if (target.kind === 'container' && target.containerId === item.id) {
    return 'Cannot go inside itself.';
  }
  if (target.kind === 'container' && isWithin(world, target.containerId, item.id)) {
    return `${targetName(world, target)} is inside ${item.name}.`;
  }
  return null;
}

/** Plans one move: what moves, what rides along, what is already there, what cannot go. */
export function planMove({ world, selectedIds, target }: MovePlanInput): MovePlan {
  const moving: ItemRowModel[] = [];
  const alreadyThere: ItemRowModel[] = [];
  const blocked: MoveBlocker[] = [];

  for (const id of new Set(selectedIds)) {
    const item = world.items.get(id);
    if (item === undefined) continue;
    const reason = blockReason(world, item, target);
    if (reason !== null) blocked.push({ itemId: item.id, itemName: item.name, reason });
    else if (samePlacement(item.placement, target)) alreadyThere.push(item);
    else moving.push(item);
  }

  const seen = new Set([...moving, ...alreadyThere].map((item) => item.id));
  const carried: ItemRowModel[] = [];
  for (const box of moving.filter((item) => item.container !== null)) {
    for (const inside of deepContents(world, box.id)) {
      if (seen.has(inside.id)) continue;
      seen.add(inside.id);
      carried.push(inside);
    }
  }

  const box = target.kind === 'container' ? world.items.get(target.containerId) : undefined;
  return {
    target,
    targetName: targetName(world, target),
    moving,
    carried,
    alreadyThere,
    blocked,
    targetRefusal: refusalFor(world, target),
    targetFull: box?.container?.full === true,
  };
}

/** Everything that changes place: the moving rows plus what they carry. */
export function affectedCount(plan: MovePlan): number {
  return plan.moving.length + plan.carried.length;
}

/** Whether applying the plan would change anything at all. */
export function planIsApplicable(plan: MovePlan): boolean {
  return plan.targetRefusal === null && plan.moving.length > 0;
}

/** The one line a refused target shows, in the words its fix needs. */
export function refusalText(plan: MovePlan): string | null {
  if (plan.targetRefusal === 'closed') return `${plan.targetName} is closed. Open it first.`;
  if (plan.targetRefusal === 'inactive') return `${plan.targetName} is no longer in use.`;
  if (plan.targetRefusal === 'missing') return `${plan.targetName} no longer exists.`;
  return null;
}

/** A drop target's answer: accept with a count, or refuse with the reason for its tooltip. */
export type DropVerdict = { ok: true; count: number } | { ok: false; reason: string };

/** Whether dragging `ids` onto `target` would do anything, and if not, why. */
export function dropVerdict(
  world: PlacementWorld,
  ids: readonly string[],
  target: PlacementTarget
): DropVerdict {
  const plan = planMove({ world, selectedIds: ids, target });
  const refusal = refusalText(plan);
  if (refusal !== null) return { ok: false, reason: refusal };
  if (plan.moving.length > 0) return { ok: true, count: affectedCount(plan) };
  if (plan.blocked[0] !== undefined) return { ok: false, reason: plan.blocked[0].reason };
  return { ok: false, reason: `Already in ${plan.targetName}.` };
}
