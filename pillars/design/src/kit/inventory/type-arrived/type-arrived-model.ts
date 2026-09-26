/**
 * Type arrived (iOS #5): a newly published type names the labels untyped
 * items were filed under before it existed; those items are matched, every
 * match starts ticked, and one Apply types the ticked ones.
 */
import type { ItemRowModel } from '../shared/model';

/** An untyped item and the label it was filed under. */
export interface UntypedItem {
  item: ItemRowModel;
  legacyLabel: string;
}

/** The type that arrived: its name, revision and the legacy labels it claims. */
export interface ArrivedType {
  id: string;
  name: string;
  revision: number;
  legacyLabels: readonly string[];
}

function normalise(label: string): string {
  return label.trim().toLowerCase();
}

/** Untyped, active items whose legacy label the type claims, in their original order. */
export function matchesFor(type: ArrivedType, untyped: readonly UntypedItem[]): UntypedItem[] {
  const claimed = new Set(type.legacyLabels.map(normalise));
  return untyped.filter(
    (entry) =>
      entry.item.typeId === null &&
      entry.item.lifecycle === 'active' &&
      claimed.has(normalise(entry.legacyLabel))
  );
}

/** A change to the ticked set. */
export type TickAction =
  | { type: 'toggle'; id: string }
  | { type: 'all'; ids: readonly string[] }
  | { type: 'none' };

/** Applies one tick action. */
export function tickReducer(state: ReadonlySet<string>, action: TickAction): ReadonlySet<string> {
  if (action.type === 'none') return new Set();
  if (action.type === 'all') return new Set(action.ids);
  const next = new Set(state);
  if (next.has(action.id)) next.delete(action.id);
  else next.add(action.id);
  return next;
}

/** The Apply button's words: it always says how many it will type. */
export function applyLabel(count: number): string {
  return count === 0 ? 'Apply' : `Apply to ${count}`;
}

/** What the undo toast says after applying. */
export function appliedMessage(count: number, typeName: string): string {
  return count === 1 ? `Typed 1 item as ${typeName}` : `Typed ${count} items as ${typeName}`;
}
