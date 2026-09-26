/**
 * What the In hand page can do with what is in hand: each item goes back to
 * where it came from when that place still exists, and needs a Move when it
 * does not (the place was deleted, or it never had one).
 */
import type { FixedPlacement, ItemRowModel } from '../shared/model';

/** Where Put back would send one item, or why it cannot. */
export type ReturnRoute =
  | { kind: 'back'; to: FixedPlacement }
  | { kind: 'deleted'; name: string }
  | { kind: 'none' };

/** The route Put back takes for one in-hand item. */
export function returnRoute(item: ItemRowModel): ReturnRoute {
  const previous = item.previous;
  if (previous === null) return { kind: 'none' };
  if (previous.kind === 'deleted') return { kind: 'deleted', name: previous.name };
  return { kind: 'back', to: previous };
}

/** The header's Put back button: what it would do, or why it cannot. */
export interface PutBackAll {
  /** Items with a place to go back to, in list order. */
  returnable: ItemRowModel[];
  /** Items that need a Move instead. */
  stranded: ItemRowModel[];
  label: string;
  disabledReason: string | null;
}

function strandedReason(stranded: readonly ItemRowModel[]): string {
  const [first] = stranded;
  if (stranded.length === 1 && first) return `${first.name} has no place to go back to`;
  return `${stranded.length} items have no place to go back to`;
}

/** Plans Put back for the whole list: all, some (counted), or none. */
export function planPutBackAll(items: readonly ItemRowModel[]): PutBackAll {
  const returnable = items.filter((item) => returnRoute(item).kind === 'back');
  const stranded = items.filter((item) => returnRoute(item).kind !== 'back');
  if (items.length === 0) {
    return { returnable, stranded, label: 'Put back all', disabledReason: 'Nothing is in hand' };
  }
  if (returnable.length === 0) {
    return {
      returnable,
      stranded,
      label: 'Put back all',
      disabledReason: strandedReason(stranded),
    };
  }
  const label =
    stranded.length === 0 ? 'Put back all' : `Put back ${returnable.length} of ${items.length}`;
  return { returnable, stranded, label, disabledReason: null };
}

/** The list order: items that need a place chosen first, then the rest, each in their original order. */
export function orderInHand(items: readonly ItemRowModel[]): ItemRowModel[] {
  const needsPlace = (item: ItemRowModel): boolean => returnRoute(item).kind !== 'back';
  return [...items.filter(needsPlace), ...items.filter((item) => !needsPlace(item))];
}
