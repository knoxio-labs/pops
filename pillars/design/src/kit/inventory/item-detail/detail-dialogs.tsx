import { targetName } from '../foundation';
/**
 * The dialogs an item page can open from its verbs and menu, one at a time:
 * the lifecycle acts, split and change quantity. Each confirm hands back to
 * the page, which applies the act and offers Undo.
 */
import { DestroyDialog } from '../lifecycle/destroy-dialog';
import { LifecycleDialog } from '../lifecycle/lifecycle-dialog';
import { QuantityDialog } from '../lifecycle/quantity-dialog';
import { RestoreDialog } from '../lifecycle/restore-dialog';
import { SplitDialog } from '../lifecycle/split-dialog';

import type { ItemRowModel, PlacementWorld } from '../foundation';

/** Which dialog is open. */
export type DetailDialog =
  | 'retire'
  | 'lost'
  | 'discard'
  | 'destroy'
  | 'restore'
  | 'split'
  | 'change-quantity';

/** Props for {@link DetailDialogs}. */
export interface DetailDialogsProps {
  item: ItemRowModel;
  world: PlacementWorld;
  open: DetailDialog | null;
  onClose: () => void;
  onDone: (dialog: DetailDialog) => void;
}

function placeName(item: ItemRowModel, world: PlacementWorld): string {
  return item.placement.kind === 'in-hand' ? 'In hand' : targetName(world, item.placement);
}

/** The open dialog, if any. */
export function DetailDialogs({ item, world, open, onClose, onDone }: DetailDialogsProps) {
  const change = (value: boolean) => (value ? undefined : onClose());
  const done = (dialog: DetailDialog) => () => onDone(dialog);
  if (open === 'retire' || open === 'lost' || open === 'discard') {
    return (
      <LifecycleDialog
        act={open}
        subject={item.name}
        open
        onOpenChange={change}
        onConfirm={done(open)}
      />
    );
  }
  if (open === 'destroy') {
    return (
      <DestroyDialog subject={item.name} open onOpenChange={change} onConfirm={done('destroy')} />
    );
  }
  if (open === 'restore' && item.lifecycle !== 'active' && item.lifecycle !== 'destroyed') {
    return (
      <RestoreDialog
        itemName={item.name}
        lifecycle={item.lifecycle}
        lastPlace={placeName(item, world)}
        open
        onOpenChange={change}
        onConfirm={done('restore')}
      />
    );
  }
  if (open === 'split') {
    return (
      <SplitDialog
        itemName={item.name}
        quantity={item.quantity}
        placeName={placeName(item, world)}
        open
        onOpenChange={change}
        onConfirm={done('split')}
      />
    );
  }
  if (open === 'change-quantity') {
    return (
      <QuantityDialog
        itemName={item.name}
        quantity={item.quantity}
        isContainer={item.container !== null}
        open
        onOpenChange={change}
        onConfirm={done('change-quantity')}
      />
    );
  }
  return null;
}
