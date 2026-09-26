/**
 * The Store here sheet's model (iOS parity #3): which existing items can go
 * into a container or place, why the others cannot, and what storing a
 * selection would do. Refusals come from the move plan, so the sheet, the
 * picker and a drop target say the same thing about the same case.
 */
import { rankMatch } from '../command-palette/palette-groups';
import { planMove, refusalText } from '../move-plan/move-plan-model';
import { targetName } from '../shared/placement-model';

import type { MovePlan } from '../move-plan/move-plan-model';
import type { StoreHereTarget } from '../shared/contracts';
import type { ItemRowModel, PlacementTarget } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';

/** One row of the Existing tab: the item and, when it cannot be stored here, why. */
export interface StoreCandidate {
  item: ItemRowModel;
  refusal: string | null;
}

/** The placement a Store here target stands for. */
export function storeTarget(target: StoreHereTarget): PlacementTarget {
  return target.kind === 'container'
    ? { kind: 'container', containerId: target.id }
    : { kind: 'location', locationId: target.id };
}

function refusalOf(world: PlacementWorld, item: ItemRowModel, target: PlacementTarget) {
  const plan = planMove({ world, selectedIds: [item.id], target });
  if (plan.blocked[0] !== undefined) return plan.blocked[0].reason;
  return plan.alreadyThere.length > 0 ? `Already in ${plan.targetName}.` : null;
}

function keywords(world: PlacementWorld, item: ItemRowModel): string[] {
  const place = item.placement.kind === 'in-hand' ? 'in hand' : targetName(world, item.placement);
  return [item.code ?? '', item.typeName ?? '', place];
}

/**
 * The items the Existing tab lists for `query`: active items only, never the
 * target itself. With no query, what is in hand comes first, because that
 * is what someone standing at a box is most likely holding. With a query,
 * name prefix beats name contains beats code, type or place.
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
      (a, b) =>
        b.rank - a.rank ||
        Number(b.item.placement.kind === 'in-hand') - Number(a.item.placement.kind === 'in-hand') ||
        a.item.name.localeCompare(b.item.name) ||
        a.index - b.index
    )
    .map(({ item }) => ({ item, refusal: refusalOf(world, item, placement) }));
}

/** What storing the selected ids would do. */
export function storePlan(
  world: PlacementWorld,
  target: StoreHereTarget,
  selectedIds: readonly string[]
): MovePlan {
  return planMove({ world, selectedIds, target: storeTarget(target) });
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

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

/** A target that refuses or warns: closed refuses every store, full only warns. */
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
