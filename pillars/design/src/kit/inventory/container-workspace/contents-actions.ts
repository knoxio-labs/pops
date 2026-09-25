/**
 * The selection bar verbs inside a container: take out, move and pick up
 * stay visible and refused with the reason when the container is closed;
 * labels, retire and discard sit under More.
 */
import { INVENTORY_ICONS } from '../foundation';

import type { SelectionBarAction } from '../foundation';
import type { ExitKind } from './unpack-model';

const I = INVENTORY_ICONS;

/** The bar's verbs for a selection of contents. */
export function barActions(
  refusal: string | null,
  run: (how: ExitKind) => void,
  move: () => void
): SelectionBarAction[] {
  const reason = refusal ?? undefined;
  return [
    {
      id: 'take-out',
      label: 'Take out',
      icon: I.takeOut,
      shortcutId: 'take-out',
      disabledReason: reason,
      onSelect: () => run('take-out'),
    },
    {
      id: 'move',
      label: 'Move',
      icon: I.move,
      shortcutId: 'move',
      disabledReason: reason,
      onSelect: move,
    },
    {
      id: 'pick-up',
      label: 'Pick up',
      icon: I.pickUp,
      shortcutId: 'pick-up',
      disabledReason: reason,
      onSelect: () => run('pick-up'),
    },
    { id: 'label', label: 'Print labels', icon: I.label, shortcutId: 'label', overflow: true },
    { id: 'retire', label: 'Retire', icon: I.retired, overflow: true },
    { id: 'discard', label: 'Discard', icon: I.discarded, overflow: true },
  ];
}
