/**
 * The Store here sheet's model: which existing items can go into a container
 * or place, why the others cannot, and what storing a selection would do.
 * Refusals come from the move plan so the sheet, picker, and drop target agree.
 */
import { rankMatch } from '@pops/ui';

import { targetName } from '../model/placement-model';
import { planMove, refusalText } from '../move-plan/move-plan-model';

import type { StoreHereTarget } from '../model/contracts';
import type { FixedPlacement, ItemRowModel, PlacementTarget } from '../model/model';
import type { PlacementWorld } from '../model/placement-model';
import type { MovePlan } from '../move-plan/move-plan-model';

/** One row of the Existing tab: the item and, when it cannot be stored here, why. */
export interface StoreCandidate {
  item: ItemRowModel;
  refusal: string | null;
}

/** The fixed placement a Store here target stands for. */
export function storeTarget(target: StoreHereTarget): FixedPlacement {
  return target.kind === 'container'
    ? { kind: 'container', containerId: target.id }
    : { kind: 'location', locationId: target.id };
}

/** Why `item` cannot be stored in `target`, or why it is already there. */
export function storeRefusal(
  world: PlacementWorld,
  item: ItemRowModel,
  target: PlacementTarget
): string | null {
  const plan = planMove({ world, selectedIds: [item.id], target });
  if (plan.blocked[0] !== undefined) return plan.blocked[0].reason;
  return plan.alreadyThere.length > 0 ? `Already in ${plan.targetName}.` : null;
}

function keywords(world: PlacementWorld, item: ItemRowModel): string[] {
  const place = item.placement.kind === 'in-hand' ? 'in hand' : targetName(world, item.placement);
  return [item.code ?? '', item.typeName ?? '', place];
}

/**
 * The active items the Existing tab lists for `query`, never including the
 * target itself. With no query, items in hand come first; a query ranks name
 * prefixes above name contains, then codes, types, and places.
 */
export function storeCandidates(
  world: PlacementWorld,
  target: StoreHereTarget,
  query: string
): StoreCandidate[] {
  const placement = storeTarget(target);
  return [...world.items.values()]
    .filter((item) => item.lifecycle === 'active' && item.id !== target.id)
    .map((item, index) => ({
      item,
      index,
      rank: rankMatch(query, item.name, keywords(world, item)),
    }))
    .filter((scored) => scored.rank > 0)
    .toSorted(
      (left, right) =>
        right.rank - left.rank ||
        Number(right.item.placement.kind === 'in-hand') -
          Number(left.item.placement.kind === 'in-hand') ||
        left.item.name.localeCompare(right.item.name) ||
        left.index - right.index
    )
    .map(({ item }) => ({ item, refusal: storeRefusal(world, item, placement) }));
}

/** What storing the selected ids would do. */
export function storePlan(
  world: PlacementWorld,
  target: StoreHereTarget,
  selectedIds: readonly string[]
): MovePlan {
  return planMove({ world, selectedIds, target: storeTarget(target) });
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** The primary button's label: the outcome, with the count. */
export function storeButtonLabel(plan: MovePlan): string {
  if (plan.moving.length === 0) return 'Store here';
  return `Store ${plural(plan.moving.length, 'item')}`;
}

/** The line above the button: what rides along inside a moving container. */
export function carriedLine(plan: MovePlan): string | null {
  if (plan.carried.length === 0) return null;
  return `Their contents move too: ${plural(plan.carried.length, 'more item')}.`;
}

/** A target that refuses or warns before a store. */
export type TargetNotice = { tone: 'refuse' | 'warn'; text: string } | null;

/** What the sheet says about its target before anything is chosen. */
export function targetNotice(world: PlacementWorld, target: StoreHereTarget): TargetNotice {
  const plan = storePlan(world, target, []);
  const refusal = refusalText(plan);
  if (refusal !== null) return { tone: 'refuse', text: refusal };
  if (plan.targetFull) {
    return {
      tone: 'warn',
      text: `${plan.targetName} is marked full. Storing more keeps the mark.`,
    };
  }
  return null;
}
