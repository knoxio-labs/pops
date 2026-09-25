/**
 * What the item page does when a verb, a menu entry, a dialog or a key
 * fires. In the playground every act lands as its undo toast; nothing
 * navigates. Kept apart from the page so the page stays layout.
 */
import { useState } from 'react';

import { targetName } from '../foundation';

import type { PlacementTarget } from '../foundation';
import type { DetailDialog } from './detail-dialogs';
import type { ItemDetailModel } from './detail-model';
import type { DetailVerb, MenuEntry } from './detail-verbs';
import type { useUndoToast } from './use-undo-toast';

type Toast = ReturnType<typeof useUndoToast>;

const DONE: Readonly<Record<DetailDialog, [Parameters<Toast['show']>[0], string]>> = {
  retire: ['retired', 'Retired'],
  lost: ['lost', 'Marked lost:'],
  discard: ['discarded', 'Discarded'],
  destroy: ['destroyed', 'Destroyed'],
  restore: ['undo', 'Restored'],
  split: ['quantity', 'Split'],
  'change-quantity': ['quantity', 'Changed the quantity of'],
};

const MENU_DIALOGS: readonly DetailDialog[] = [
  'retire',
  'lost',
  'discard',
  'destroy',
  'split',
  'change-quantity',
];

function menuDialog(id: string): DetailDialog | null {
  return MENU_DIALOGS.find((dialog) => dialog === id) ?? null;
}

/** Page state for dialogs, the picker and Store here, plus the handlers that drive them. */
export function useDetailActions(
  model: ItemDetailModel,
  toast: Toast,
  initial: { dialog?: DetailDialog | null; picker?: boolean; storeHere?: boolean }
) {
  const [dialog, setDialog] = useState<DetailDialog | null>(initial.dialog ?? null);
  const [pickerOpen, setPickerOpen] = useState(initial.picker ?? false);
  const [storeHereOpen, setStoreHereOpen] = useState(initial.storeHere ?? false);
  const name = model.item.name;

  const onVerb = (verb: DetailVerb) => {
    if (verb.disabledReason !== undefined) return;
    if (verb.id === 'pick-up') toast.show('pickUp', `Picked up ${name}`);
    if (verb.id === 'put-back')
      toast.show('putBack', `Put ${name} back ${verb.detail?.toLowerCase() ?? ''}`.trim());
    if (verb.id === 'open') toast.show('open', `Opened ${name}`);
    if (verb.id === 'close') toast.show('closed', `Closed ${name}`);
    if (verb.id === 'store-here') setStoreHereOpen(true);
    if (verb.id === 'restore') setDialog('restore');
    if (verb.id === 'move') setPickerOpen(true);
  };
  const onMenu = (entry: MenuEntry) => {
    const next = menuDialog(entry.id);
    if (next !== null) setDialog(next);
  };
  const onPick = (target: PlacementTarget) => {
    const where = target.kind === 'in-hand' ? 'in hand' : `to ${targetName(model.world, target)}`;
    toast.show('move', `Moved ${name} ${where}`);
  };
  const onDone = (done: DetailDialog) => {
    setDialog(null);
    if (done === 'destroy') return;
    const [concept, verb] = DONE[done];
    toast.show(concept, `${verb} ${name}`);
  };
  return {
    dialog,
    setDialog,
    pickerOpen,
    setPickerOpen,
    storeHereOpen,
    setStoreHereOpen,
    onVerb,
    onMenu,
    onPick,
    onDone,
  };
}
