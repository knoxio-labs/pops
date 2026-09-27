import { DestroyDialog } from '../../foundation/lifecycle/destroy-dialog';
import { LifecycleDialog } from '../../foundation/lifecycle/lifecycle-dialog';
import { QuantityDialog } from '../../foundation/lifecycle/quantity-dialog';
import { RestoreDialog } from '../../foundation/lifecycle/restore-dialog';
import { SplitDialog } from '../../foundation/lifecycle/split-dialog';
import { targetName } from '../../foundation/model';

import type { ReactElement } from 'react';

import type { ItemRowModel, PlacementWorld } from '../../foundation/model';

/** The dialogs opened by an item-detail verb or More-menu entry. */
export type DetailDialog =
  | 'retire'
  | 'lost'
  | 'discard'
  | 'destroy'
  | 'restore'
  | 'split'
  | 'change-quantity';

/** The typed answer returned by each detail dialog. */
export type DoneAct =
  | { dialog: 'retire' | 'lost' | 'discard' | 'destroy'; reason: string | null }
  | { dialog: 'restore'; where: 'last-place' | 'in-hand' | 'choose' }
  | { dialog: 'split'; count: number }
  | { dialog: 'change-quantity'; quantity: number };

/** Props for the one-at-a-time item-detail dialog host. */
export interface DetailDialogsProps {
  item: ItemRowModel;
  world: PlacementWorld;
  open: DetailDialog | null;
  onClose: () => void;
  onDone: (done: DoneAct) => void;
}

interface DetailDialogViewProps {
  item: ItemRowModel;
  world: PlacementWorld;
  open: DetailDialog;
  onOpenChange: (open: boolean) => void;
  onDone: (done: DoneAct) => void;
}

type LifecycleDetailDialogProps = Omit<DetailDialogViewProps, 'open' | 'world'> & {
  open: 'retire' | 'lost' | 'discard';
};

type RestorableItem = ItemRowModel & {
  lifecycle: 'retired' | 'lost' | 'discarded';
};

function placeName(item: ItemRowModel, world: PlacementWorld): string {
  return item.placement.kind === 'in-hand' ? 'In hand' : targetName(world, item.placement);
}

function isRestorableItem(item: ItemRowModel): item is RestorableItem {
  return item.lifecycle !== 'active' && item.lifecycle !== 'destroyed';
}

function LifecycleDetailDialog({
  item,
  open,
  onOpenChange,
  onDone,
}: LifecycleDetailDialogProps): ReactElement {
  return (
    <LifecycleDialog
      act={open}
      subject={item.name}
      open
      onOpenChange={onOpenChange}
      onConfirm={(reason) => onDone({ dialog: open, reason })}
    />
  );
}

function DestroyDetailDialog({ item, onOpenChange, onDone }: DetailDialogViewProps): ReactElement {
  return (
    <DestroyDialog
      subject={item.name}
      open
      onOpenChange={onOpenChange}
      onConfirm={(reason) => onDone({ dialog: 'destroy', reason })}
    />
  );
}

function RestoreDetailDialog({
  item,
  world,
  onOpenChange,
  onDone,
}: Omit<DetailDialogViewProps, 'item'> & { item: RestorableItem }): ReactElement {
  return (
    <RestoreDialog
      itemName={item.name}
      lifecycle={item.lifecycle}
      lastPlace={placeName(item, world)}
      open
      onOpenChange={onOpenChange}
      onConfirm={(where) => onDone({ dialog: 'restore', where })}
    />
  );
}

function SplitDetailDialog({
  item,
  world,
  onOpenChange,
  onDone,
}: DetailDialogViewProps): ReactElement {
  return (
    <SplitDialog
      itemName={item.name}
      quantity={item.quantity}
      placeName={placeName(item, world)}
      open
      onOpenChange={onOpenChange}
      onConfirm={(count) => onDone({ dialog: 'split', count })}
    />
  );
}

function QuantityDetailDialog({ item, onOpenChange, onDone }: DetailDialogViewProps): ReactElement {
  return (
    <QuantityDialog
      itemName={item.name}
      quantity={item.quantity}
      isContainer={item.container !== null}
      open
      onOpenChange={onOpenChange}
      onConfirm={(quantity) => onDone({ dialog: 'change-quantity', quantity })}
    />
  );
}

function renderDetailDialog(props: DetailDialogViewProps): ReactElement | null {
  const { item, open } = props;
  if (open === 'retire' || open === 'lost' || open === 'discard') {
    return (
      <LifecycleDetailDialog
        item={item}
        open={open}
        onOpenChange={props.onOpenChange}
        onDone={props.onDone}
      />
    );
  }
  if (open === 'destroy') return <DestroyDetailDialog {...props} />;
  if (open === 'restore' && isRestorableItem(item)) {
    return (
      <RestoreDetailDialog
        item={item}
        world={props.world}
        open={open}
        onOpenChange={props.onOpenChange}
        onDone={props.onDone}
      />
    );
  }
  if (open === 'split') return <SplitDetailDialog {...props} />;
  if (open === 'change-quantity') return <QuantityDetailDialog {...props} />;
  return null;
}

/** Renders the selected lifecycle, restore, split, or quantity dialog. */
export function DetailDialogs({
  item,
  world,
  open,
  onClose,
  onDone,
}: DetailDialogsProps): ReactElement | null {
  if (open === null) return null;
  return renderDetailDialog({
    item,
    world,
    open,
    onOpenChange: (value) => {
      if (!value) onClose();
    },
    onDone,
  });
}
