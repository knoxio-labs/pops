import { ClipboardCopy, Download, SquarePen } from 'lucide-react';

import { MAX_LABEL_IDS } from '../../pages/labels-page/label-params.js';
import { INVENTORY_ICONS } from '../model/icons.js';
import { isWithin } from '../model/placement-model.js';

import type { BulkItemRefusal } from '../../inventory-web/item-verbs-bulk.js';
import type { RowVerbId } from '../items-table/items-table.js';
import type { ItemRowModel, PlacementTarget, SelectionBarAction } from '../model/index.js';
import type { PlacementWorld } from '../model/placement-model.js';

/** The selection-bar commands available to inventory item lists. */
export type SelectionActionId =
  | 'pick-up'
  | 'move'
  | 'take-out'
  | 'label'
  | 'set-type'
  | 'set-field'
  | 'retire'
  | 'discard'
  | 'export'
  | 'copy-codes';

/** Handlers supplied by an item list or by an optional list feature. */
export type SelectionHandlers = Partial<Record<SelectionActionId, () => void>>;

/** Inputs for the built-in selection-bar handlers. */
export interface SelectionActionHandlerInput {
  world: PlacementWorld;
  ids: readonly string[];
  offline: boolean;
  onPickUp: () => void;
  onMove: () => void;
  onTakeOut: () => void;
  onLabel: () => void;
  onCopyCodes: () => void;
}

/** Creates the built-in selection handlers while respecting offline and placement guards. */
export function selectionActionHandlers(input: SelectionActionHandlerInput): SelectionHandlers {
  return {
    'pick-up': () => {
      if (!input.offline && !allInHand(input.world, input.ids)) input.onPickUp();
    },
    move: () => {
      if (!input.offline) input.onMove();
    },
    'take-out': () => {
      if (!input.offline && canTakeOut(input.world, input.ids)) input.onTakeOut();
    },
    label: () => {
      if (!input.offline && canLabel(input.ids)) input.onLabel();
    },
    'copy-codes': () => {
      if (!input.offline) input.onCopyCodes();
    },
  };
}

/** Writes selected item codes in list order when the browser exposes a clipboard. */
export function copyCodes(rows: readonly ItemRowModel[], ids: readonly string[]): void {
  const selected = new Set(ids);
  const codes = rows
    .filter((row) => selected.has(row.id))
    .map((row) => row.code)
    .filter((code): code is string => code !== null);
  const write = navigator.clipboard?.writeText;
  if (write !== undefined) void write.call(navigator.clipboard, codes.join('\n'));
}

/** Returns selected rows, or the focused row when the selection is empty. */
export function selectedOrFocusedIds(
  rows: readonly ItemRowModel[],
  selection: { count: number; selectedIds: readonly string[]; state: { focusedId: string | null } }
): string[] {
  if (selection.count > 0) return [...selection.selectedIds];
  const focusedId = selection.state.focusedId;
  return focusedId !== null && rows.some((row) => row.id === focusedId) ? [focusedId] : [];
}

/** Returns whether every selected item is already in hand. */
export function allInHand(world: PlacementWorld, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => world.items.get(id)?.placement.kind === 'in-hand');
}

/** Returns whether at least one selected item is inside a container. */
export function canTakeOut(world: PlacementWorld, ids: readonly string[]): boolean {
  return ids.some((id) => world.items.get(id)?.placement.kind === 'container');
}

/** Returns whether a label job is within the server's accepted size range. */
export function canLabel(ids: readonly string[]): boolean {
  return ids.length > 0 && ids.length <= MAX_LABEL_IDS;
}

function selectionAction(
  id: SelectionActionId,
  label: string,
  icon: typeof INVENTORY_ICONS.pickUp,
  ...config: [
    SelectionHandlers,
    Pick<SelectionBarAction, 'disabledReason' | 'overflow' | 'shortcutId'>?,
  ]
): SelectionBarAction {
  const [handlers, options = {}] = config;
  return { id, label, icon, onSelect: handlers[id], ...options };
}

/** Builds the stable selection-bar order while keeping optional commands visible. */
export function itemSelectionActions(
  world: PlacementWorld,
  ids: readonly string[],
  handlers: SelectionHandlers = {}
): SelectionBarAction[] {
  const actions = [
    selectionAction('pick-up', 'Pick up', INVENTORY_ICONS.pickUp, handlers, {
      shortcutId: 'pick-up',
      disabledReason: allInHand(world, ids) ? 'Already in hand' : undefined,
    }),
    selectionAction('move', 'Move', INVENTORY_ICONS.move, handlers, { shortcutId: 'move' }),
    selectionAction('take-out', 'Take out', INVENTORY_ICONS.takeOut, handlers, {
      shortcutId: 'take-out',
      disabledReason: ids.some((id) => world.items.get(id)?.placement.kind === 'container')
        ? undefined
        : 'None of these is inside a container',
    }),
    selectionAction('label', 'Print labels', INVENTORY_ICONS.label, handlers, {
      shortcutId: 'label',
      disabledReason:
        ids.length > MAX_LABEL_IDS
          ? `Print labels takes at most ${MAX_LABEL_IDS} items`
          : undefined,
    }),
    selectionAction('set-type', 'Set type', INVENTORY_ICONS.type, handlers),
    selectionAction('set-field', 'Set field', SquarePen, handlers),
    selectionAction('retire', 'Retire', INVENTORY_ICONS.retired, handlers, { overflow: true }),
    selectionAction('discard', 'Discard', INVENTORY_ICONS.discarded, handlers, { overflow: true }),
    selectionAction('export', 'Export selected as CSV', Download, handlers, { overflow: true }),
    selectionAction('copy-codes', 'Copy codes', ClipboardCopy, handlers, { overflow: true }),
  ];
  return actions;
}

/** Counts unselected descendants carried by selected top-level containers. */
export function carriedCount(
  ids: readonly string[],
  contentCounts: Readonly<Record<string, { direct: number; deep: number }>>,
  world: PlacementWorld
): number {
  const selected = [...new Set(ids)];
  const selectedContainers = selected.filter((id) => {
    const item = world.items.get(id);
    return item !== undefined && item.container !== null;
  });
  const topLevelContainers = selectedContainers.filter(
    (id) => !selected.some((other) => other !== id && isWithin(world, id, other))
  );
  const carried = topLevelContainers.reduce(
    (total, id) => total + (contentCounts[id]?.deep ?? 0),
    0
  );
  const selectedDescendants = selected.filter((id) =>
    selected.some((other) => other !== id && isWithin(world, id, other))
  ).length;
  return Math.max(0, carried - selectedDescendants);
}

/** Converts a bulk refusal into the inline reason shown beside an item. */
export function refusalReason(refusal: BulkItemRefusal): string {
  if (refusal.kind === 'no-previous-place') return 'It has no place to go back to.';
  if (refusal.kind === 'outcome') {
    if (refusal.outcome.status === 'rejected') return refusal.outcome.message;
    if (refusal.outcome.status === 'conflict') return 'Changed elsewhere since it loaded.';
    if (refusal.outcome.status === 'deferred') return 'Waiting on another change.';
  }
  return 'The inventory service did not answer.';
}

/** Returns the placement of an item's container, or null when no such container is known. */
export function takeOutTarget(world: PlacementWorld, id: string): PlacementTarget | null {
  const item = world.items.get(id);
  if (item?.placement.kind !== 'container') return null;
  return world.items.get(item.placement.containerId)?.placement ?? null;
}

/** Returns whether a row has a usable fixed remembered placement. */
export function hasPreviousPlace(row: ItemRowModel): boolean {
  return row.previous?.kind === 'location' || row.previous?.kind === 'container';
}

/** Creates the row placement handler used by tables and focused list rows. */
export function createRowVerbHandler(input: {
  offline: boolean;
  world: PlacementWorld;
  setRejection: (id: string, reason: string | null) => void;
  runPickUp: (id: string, itemName: string) => void;
  runPutBack: (
    id: string,
    itemName: string,
    target: PlacementTarget,
    world: PlacementWorld
  ) => void;
  openPicker: (ids: readonly string[], mode: 'row', anchor?: Element | null) => void;
}): (verb: RowVerbId, item: ItemRowModel, anchor?: Element | null) => void {
  return (verb, item, anchor): void => {
    if (input.offline || verb === 'more') return;
    if (verb === 'pick-up') {
      input.runPickUp(item.id, item.name);
      return;
    }
    if (verb === 'put-back') {
      if (!hasPreviousPlace(item)) {
        input.setRejection(item.id, refusalReason({ kind: 'no-previous-place' }));
        return;
      }
      const previous = item.previous;
      if (previous === null || previous.kind === 'deleted') return;
      input.runPutBack(item.id, item.name, previous, input.world);
      return;
    }
    input.openPicker([item.id], 'row', anchor);
  };
}
