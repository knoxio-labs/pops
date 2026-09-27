import { INVENTORY_ICONS } from '../../../foundation/model/icons.js';
import { MAX_LABEL_IDS } from '../../labels-page/label-params.js';

import type { SelectionBarAction } from '../../../foundation/model/contracts.js';
import type { ExitKind } from './unpack-model.js';

/** Inputs for the bulk actions shown below a container's direct contents. */
export interface ContainerSelectionActionInput {
  ids: readonly string[];
  exitDisabledReason?: string;
  readOnlyReason?: string;
  onExit: (how: ExitKind) => void;
  onMove: () => void;
  onLabel: () => void;
  onLifecycle: (lifecycle: 'retire' | 'discard') => void;
}

function placementActions(
  input: ContainerSelectionActionInput,
  disabledReason: string | undefined
): SelectionBarAction[] {
  return [
    {
      id: 'take-out',
      label: 'Take out',
      icon: INVENTORY_ICONS.takeOut,
      shortcutId: 'take-out',
      disabledReason,
      onSelect: () => input.onExit('take-out'),
    },
    {
      id: 'move',
      label: 'Move',
      icon: INVENTORY_ICONS.move,
      shortcutId: 'move',
      disabledReason,
      onSelect: input.onMove,
    },
    {
      id: 'pick-up',
      label: 'Pick up',
      icon: INVENTORY_ICONS.pickUp,
      shortcutId: 'pick-up',
      disabledReason,
      onSelect: () => input.onExit('pick-up'),
    },
  ];
}

function labelLimitReason(count: number): string | undefined {
  return count > MAX_LABEL_IDS ? `Print labels takes at most ${MAX_LABEL_IDS} items` : undefined;
}

function overflowActions(input: ContainerSelectionActionInput): SelectionBarAction[] {
  const labelDisabledReason = input.readOnlyReason ?? labelLimitReason(input.ids.length);
  return [
    {
      id: 'label',
      label: 'Print labels',
      icon: INVENTORY_ICONS.label,
      shortcutId: 'label',
      disabledReason: labelDisabledReason,
      overflow: true,
      onSelect: input.onLabel,
    },
    {
      id: 'retire',
      label: 'Retire',
      icon: INVENTORY_ICONS.retired,
      disabledReason: input.readOnlyReason,
      overflow: true,
      onSelect: () => input.onLifecycle('retire'),
    },
    {
      id: 'discard',
      label: 'Discard',
      icon: INVENTORY_ICONS.discarded,
      disabledReason: input.readOnlyReason,
      overflow: true,
      onSelect: () => input.onLifecycle('discard'),
    },
  ];
}

/** Builds the placement and lifecycle actions for a direct-content selection. */
export function containerSelectionActions(
  input: ContainerSelectionActionInput
): SelectionBarAction[] {
  const disabledReason = input.readOnlyReason ?? input.exitDisabledReason;
  return [...placementActions(input, disabledReason), ...overflowActions(input)];
}
