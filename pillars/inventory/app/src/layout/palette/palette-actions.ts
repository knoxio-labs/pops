import { toast } from 'sonner';

import { showUndoToast } from '../../foundation/feedback/undo-toast.js';
import { targetName } from '../../foundation/model/placement-model.js';
import { recordOpened, recordQuery } from '../../inventory-web/recents.js';

import type { NavigateFunction } from 'react-router';

import type { FixedPlacement } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { ItemVerbs, VerbResult } from '../../inventory-web/item-verbs.js';
import type { InventoryPaletteCommand, PaletteCommandAction } from './palette-groups.js';

/** The context needed to execute an inventory palette action. */
export interface PaletteActionContext {
  readonly action: PaletteCommandAction;
  readonly argument: InventoryPaletteCommand | null;
  readonly inputQuery: string;
  readonly navigate: NavigateFunction;
  readonly onClose: () => void;
  readonly verbs: ItemVerbs;
  readonly world: PlacementWorld;
}

function itemHref(id: string): string {
  return `/inventory/items/${encodeURIComponent(id)}`;
}

function locationHref(id: string): string {
  return `/inventory/locations/${encodeURIComponent(id)}`;
}

/** Returns the route used by Cmd-Enter for record rows. */
export function paletteRecordHref(action: PaletteCommandAction): string | null {
  if (action.kind === 'open-item') return itemHref(action.id);
  if (action.kind === 'open-location') return locationHref(action.id);
  return null;
}

function targetFromArgument(argument: InventoryPaletteCommand | null): FixedPlacement | null {
  return argument?.target ?? null;
}

function showVerbResult(
  result: VerbResult,
  message: string,
  concept: 'move' | 'pickUp' | 'putBack' | 'open' | 'closed'
): void {
  if (result.status === 'refused') {
    toast.error('The inventory change was refused.');
    return;
  }
  if (result.undo !== null) showUndoToast({ concept, message, onUndo: result.undo });
}

function reportActionError(error: unknown): void {
  toast.error(
    error instanceof Error ? error.message : 'The inventory change could not be completed.'
  );
}

function runVerb(
  operation: () => Promise<VerbResult>,
  message: string,
  concept: 'move' | 'pickUp' | 'putBack' | 'open' | 'closed'
): void {
  void operation()
    .then((result) => showVerbResult(result, message, concept))
    .catch(reportActionError);
}

interface ItemActionContext {
  readonly action: Exclude<
    PaletteCommandAction,
    { kind: 'navigate' | 'open-item' | 'open-location' | 'copy-code' }
  >;
  readonly argument: InventoryPaletteCommand | null;
  readonly verbs: ItemVerbs;
  readonly world: PlacementWorld;
  readonly onClose: () => void;
}

function runItemAction({ action, argument, verbs, world, onClose }: ItemActionContext): void {
  const item = world.items.get(action.itemId);
  if (item === undefined) {
    toast.error('That item is not loaded yet.');
    return;
  }
  if (action.kind === 'move') {
    const target = targetFromArgument(argument);
    if (target === null) {
      toast.error('Choose a destination to move this item.');
      return;
    }
    onClose();
    runVerb(
      () => verbs.move(action.itemId, target),
      `Moved ${item.name} to ${targetName(world, target)}`,
      'move'
    );
    return;
  }
  onClose();
  if (action.kind === 'pick-up') {
    runVerb(() => verbs.pickUp(action.itemId), `Picked up ${item.name}`, 'pickUp');
    return;
  }
  if (action.kind === 'put-back') {
    runVerb(() => verbs.putBack(action.itemId), `Put ${item.name} back`, 'putBack');
    return;
  }
  runVerb(
    () => verbs.setAccess(action.itemId, action.access),
    `${action.access === 'open' ? 'Opened' : 'Closed'} ${item.name}`,
    action.access === 'open' ? 'open' : 'closed'
  );
}

/** Executes a selected palette action using the inventory's existing navigation and verb APIs. */
export function runPaletteAction({
  action,
  argument,
  inputQuery,
  navigate,
  onClose,
  verbs,
  world,
}: PaletteActionContext): void {
  if (action.kind === 'navigate') {
    recordQuery(inputQuery);
    void navigate(action.href);
    onClose();
    return;
  }
  if (action.kind === 'open-item') {
    recordOpened({ kind: 'item', id: action.id });
    void navigate(itemHref(action.id));
    onClose();
    return;
  }
  if (action.kind === 'open-location') {
    recordOpened({ kind: 'location', id: action.id });
    void navigate(locationHref(action.id));
    onClose();
    return;
  }
  if (action.kind === 'copy-code') {
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      toast.error('Copying is not available in this browser.');
    } else {
      void clipboard
        .writeText(action.code)
        .catch(() => toast.error('The item code could not be copied.'));
    }
    onClose();
    return;
  }
  runItemAction({ action, argument, verbs, world, onClose });
}
