import { toast } from 'sonner';

import {
  CONCEPT_FOR_DIALOG,
  LIFECYCLE_FOR_DIALOG,
  lifecycleMessage,
  type DetailItemVerbs,
  type MutationRunner,
} from './detail-action-helpers';

import type { ItemRowModel } from '../../foundation/model';
import type { DetailDialog, DoneAct } from './detail-dialogs';

/** Dependencies used to build callbacks for item-detail dialogs. */
export interface DetailDialogHandlerContext {
  item: ItemRowModel;
  itemVerbs: DetailItemVerbs;
  runMutation: MutationRunner;
  setDialog: (dialog: DetailDialog | null) => void;
  setRefusal: (reason: string | null) => void;
  setPickerOpen: (open: boolean) => void;
}

function isLifecycleDone(
  done: DoneAct
): done is Extract<DoneAct, { dialog: keyof typeof LIFECYCLE_FOR_DIALOG }> {
  return (
    done.dialog === 'retire' ||
    done.dialog === 'lost' ||
    done.dialog === 'discard' ||
    done.dialog === 'destroy'
  );
}

function runLifecycle(
  context: DetailDialogHandlerContext,
  done: Extract<DoneAct, { reason: string | null }>
): void {
  const lifecycle = LIFECYCLE_FOR_DIALOG[done.dialog];
  const concept = CONCEPT_FOR_DIALOG[done.dialog];
  void context.runMutation(
    context.itemVerbs.setLifecycle(context.item.id, lifecycle, done.reason),
    concept,
    lifecycleMessage(done.dialog, context.item.name),
    done.dialog !== 'destroy'
  );
}

async function restoreItem(
  context: DetailDialogHandlerContext,
  where: Extract<DoneAct, { dialog: 'restore' }>['where']
): Promise<void> {
  const restored = await context.runMutation(
    context.itemVerbs.restore(context.item.id),
    'undo',
    `Restored ${context.item.name}`
  );
  if (restored?.status !== 'applied') return;
  if (where === 'in-hand') {
    await context.runMutation(
      context.itemVerbs.pickUp(context.item.id),
      'pickUp',
      `Picked up ${context.item.name}`
    );
  } else if (where === 'choose') {
    context.setPickerOpen(true);
  }
}

function runSplit(context: DetailDialogHandlerContext, count: number): void {
  void context
    .runMutation(
      context.itemVerbs.split(context.item.id, count),
      'quantity',
      `Split ${context.item.name}`,
      false
    )
    .then((result) => {
      if (result?.status === 'applied') toast.success(`Split ${context.item.name}`);
    });
}

function runQuantity(context: DetailDialogHandlerContext, quantity: number): void {
  void context.runMutation(
    context.itemVerbs.setQuantity(context.item.id, quantity),
    'quantity',
    `Changed the quantity of ${context.item.name}`
  );
}

/** Builds the callback that closes and applies an item-detail dialog. */
export function createDoneHandler(context: DetailDialogHandlerContext): (done: DoneAct) => void {
  return (done): void => {
    context.setDialog(null);
    context.setRefusal(null);

    if (isLifecycleDone(done)) {
      runLifecycle(context, done);
      return;
    }
    if (done.dialog === 'restore') {
      void restoreItem(context, done.where);
      return;
    }
    if (done.dialog === 'split') {
      runSplit(context, done.count);
      return;
    }
    runQuantity(context, done.quantity);
  };
}
