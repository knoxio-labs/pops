/**
 * The bulk verbs for a selection of items, shared by Items, Containers and
 * Search. Verbs a selection cannot take stay on the bar and say why. Print
 * labels opens the labels page with the selection (owner decision 1).
 * Retire and Discard live under More: they are rarer than placement verbs,
 * and both are undoable from their toast.
 */
import { ClipboardCopy, Download, SquarePen } from 'lucide-react';

import { INVENTORY_ICONS, deepContents } from '../foundation';

import type { PlacementWorld, SelectionBarAction } from '../foundation';

const I = INVENTORY_ICONS;

/** What the bar's verbs do; every handler is optional in a design state. */
export interface SelectionHandlers {
  onPickUp?: () => void;
  onMove?: () => void;
  onTakeOut?: () => void;
  onPrintLabels?: () => void;
  onSetType?: () => void;
  onSetField?: () => void;
}

function takeOutReason(world: PlacementWorld, ids: readonly string[]): string | undefined {
  const boxed = ids.some((id) => world.items.get(id)?.placement.kind === 'container');
  return boxed ? undefined : 'None of these is inside a container';
}

function pickUpReason(world: PlacementWorld, ids: readonly string[]): string | undefined {
  const allInHand =
    ids.length > 0 && ids.every((id) => world.items.get(id)?.placement.kind === 'in-hand');
  return allInHand ? 'Already in hand' : undefined;
}

/** The selection bar's verbs for these selected ids. */
export function itemSelectionActions(
  world: PlacementWorld,
  ids: readonly string[],
  handlers: SelectionHandlers = {}
): SelectionBarAction[] {
  return [
    {
      id: 'pick-up',
      label: 'Pick up',
      icon: I.pickUp,
      shortcutId: 'pick-up',
      disabledReason: pickUpReason(world, ids),
      onSelect: handlers.onPickUp,
    },
    { id: 'move', label: 'Move', icon: I.move, shortcutId: 'move', onSelect: handlers.onMove },
    {
      id: 'take-out',
      label: 'Take out',
      icon: I.takeOut,
      shortcutId: 'take-out',
      disabledReason: takeOutReason(world, ids),
      onSelect: handlers.onTakeOut,
    },
    {
      id: 'label',
      label: 'Print labels',
      icon: I.label,
      shortcutId: 'label',
      onSelect: handlers.onPrintLabels,
    },
    { id: 'set-type', label: 'Set type', icon: I.type, onSelect: handlers.onSetType },
    { id: 'set-field', label: 'Set field', icon: SquarePen, onSelect: handlers.onSetField },
    { id: 'retire', label: 'Retire', icon: I.retired, overflow: true },
    { id: 'discard', label: 'Discard', icon: I.discarded, overflow: true },
    { id: 'export', label: 'Export selected as CSV', icon: Download, overflow: true },
    { id: 'copy-codes', label: 'Copy codes', icon: ClipboardCopy, overflow: true },
  ];
}

/** Contents the selected containers would carry along, for "5 selected, 12 inside". */
export function carriedCount(world: PlacementWorld, ids: readonly string[]): number {
  const selected = new Set(ids);
  const carried = ids
    .flatMap((id) => deepContents(world, id))
    .filter((inside) => !selected.has(inside.id));
  return new Set(carried.map((inside) => inside.id)).size;
}
