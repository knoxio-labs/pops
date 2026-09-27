import type { ItemRowModel } from '../../foundation/model/model.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';

/** The published type details needed by the Type arrived page. */
export interface ArrivedType {
  id: string;
  key: string;
  name: string;
  revision: number;
  legacyLabels: readonly string[];
}

/** An item returned by the server with the legacy label it was filed under. */
export interface UntypedItem {
  item: ItemRowModel;
  legacyLabel: string;
}

/** A change to the set of items that will be typed. */
export type TickAction =
  | { type: 'toggle'; id: string }
  | { type: 'all'; ids: readonly string[] }
  | { type: 'none' };

/** The review stage shown by the Type arrived page. */
export type TypeArrivedStage = 'review' | 'applied' | 'not-now';

/** Converts a published catalogue type into the page's display model. */
export function toArrivedType(type: CatalogueType): ArrivedType {
  return {
    id: type.id,
    key: type.key,
    name: type.label,
    revision: type.revision,
    legacyLabels: type.legacyLabels,
  };
}

/** Applies one tick action without mutating the previous selection. */
export function tickReducer(state: ReadonlySet<string>, action: TickAction): ReadonlySet<string> {
  if (action.type === 'none') return new Set();
  if (action.type === 'all') return new Set(action.ids);
  const next = new Set(state);
  if (next.has(action.id)) next.delete(action.id);
  else next.add(action.id);
  return next;
}

/** Renders the Apply action with its current selection count. */
export function applyLabel(count: number): string {
  return count === 0 ? 'Apply' : `Apply to ${count}`;
}

/** Renders the undo message for a completed bulk type change. */
export function appliedMessage(count: number, typeName: string): string {
  return count === 1 ? `Typed 1 item as ${typeName}` : `Typed ${count} items as ${typeName}`;
}

/** Renders every claimed legacy label in the page description. */
export function labelsText(type: ArrivedType): string {
  return type.legacyLabels.map((label) => `“${label}”`).join(' or ');
}

/** Renders the page description for review or the completed outcome. */
export function describeArrival(
  stage: TypeArrivedStage,
  type: ArrivedType,
  matched: number,
  applied: number
): string {
  const published = `Revision ${type.revision} published ${type.name}.`;
  if (matched === 0) return `${published} It claims items filed as ${labelsText(type)}.`;
  if (stage === 'applied') {
    const left = matched - applied;
    return `${published} ${applied} items are now ${type.name}.${left > 0 ? ` ${left} left untyped.` : ''}`;
  }
  return `${published} ${matched} untyped items were filed as ${labelsText(type)}. Untick any that are not ${type.name}.`;
}
