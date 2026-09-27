import { targetName } from '../../foundation/model';
import { labelsHref } from '../labels-page/label-params';
import {
  copyText,
  fixedTarget,
  itemPath,
  type MutationRunner,
  errorReason,
} from './detail-action-helpers';

import type { NavigateFunction } from 'react-router';

import type { ItemRowModel, PlacementTarget, PlacementWorld } from '../../foundation/model';
import type { DetailItemVerbs } from './detail-action-helpers';
import type { DetailDialog } from './detail-dialogs';
import type { DetailVerb, MenuEntry } from './detail-verbs';

/** Dependencies used to build the header and menu callbacks. */
export interface DetailVerbHandlerContext {
  item: ItemRowModel;
  world: PlacementWorld;
  itemVerbs: DetailItemVerbs;
  navigate: NavigateFunction;
  runMutation: MutationRunner;
  setRefusal: (reason: string | null) => void;
  setDialog: (dialog: DetailDialog | null) => void;
  setPickerOpen: (open: boolean) => void;
  setStoreHereOpen: (open: boolean) => void;
}

function accessAction(
  verb: 'open' | 'close',
  item: ItemRowModel,
  itemVerbs: DetailItemVerbs,
  runMutation: MutationRunner
): void {
  const access = verb === 'open' ? 'open' : 'closed';
  const concept = access === 'open' ? 'open' : 'closed';
  const message = access === 'open' ? `Opened ${item.name}` : `Closed ${item.name}`;
  void runMutation(itemVerbs.setAccess(item.id, access), concept, message);
}

/** Builds the callback for a visible header verb. */
export function createVerbHandler(context: DetailVerbHandlerContext): (verb: DetailVerb) => void {
  return (verb): void => {
    if (verb.disabledReason !== undefined) return;
    context.setRefusal(null);

    switch (verb.id) {
      case 'pick-up':
        void context.runMutation(
          context.itemVerbs.pickUp(context.item.id),
          'pickUp',
          `Picked up ${context.item.name}`
        );
        return;
      case 'put-back': {
        const place = verb.detail?.replace(/^To /u, '') ?? 'its previous place';
        void context.runMutation(
          context.itemVerbs.putBack(context.item.id),
          'putBack',
          `Put ${context.item.name} back to ${place}`
        );
        return;
      }
      case 'open':
      case 'close':
        accessAction(verb.id, context.item, context.itemVerbs, context.runMutation);
        return;
      case 'store-here':
        context.setStoreHereOpen(true);
        return;
      case 'restore':
        context.setDialog('restore');
        return;
      case 'move':
        context.setPickerOpen(true);
        return;
      case 'edit':
        void context.navigate(`/inventory/items/${context.item.id}/edit`);
    }
  };
}

/** Builds the callback that applies a PlacementPicker selection in place. */
export function createPickHandler(
  context: DetailVerbHandlerContext
): (target: PlacementTarget) => void {
  return (target): void => {
    context.setRefusal(null);
    context.setPickerOpen(false);
    if (target.kind === 'in-hand') {
      void context.runMutation(
        context.itemVerbs.pickUp(context.item.id),
        'pickUp',
        `Moved ${context.item.name} in hand`
      );
      return;
    }

    const fixed = fixedTarget(target);
    if (fixed === null) return;
    void context.runMutation(
      context.itemVerbs.move(context.item.id, fixed),
      'move',
      `Moved ${context.item.name} to ${targetName(context.world, target)}`
    );
  };
}

function menuDialog(id: string): Exclude<DetailDialog, 'restore'> | null {
  switch (id) {
    case 'split':
    case 'change-quantity':
    case 'retire':
    case 'lost':
    case 'discard':
    case 'destroy':
      return id;
    default:
      return null;
  }
}

/** Builds the callback for More-menu record, shape, and lifecycle actions. */
export function createMenuHandler(context: DetailVerbHandlerContext): (entry: MenuEntry) => void {
  return (entry): void => {
    if (entry.disabledReason !== undefined) return;
    context.setRefusal(null);

    switch (entry.id) {
      case 'copy-code':
        if (context.item.code !== null) {
          void copyText(context.item.code).catch((error: unknown) =>
            context.setRefusal(errorReason(error))
          );
        }
        return;
      case 'copy-link':
        void copyText(`${window.location.origin}${itemPath(context.item.id)}`).catch(
          (error: unknown) => context.setRefusal(errorReason(error))
        );
        return;
      case 'label':
        void context.navigate(labelsHref([context.item.id]));
        return;
      case 'history':
        void context.navigate(`${itemPath(context.item.id)}/history`);
        return;
      case 'toggle-full': {
        const full = context.item.container?.full === true;
        const message = full
          ? `Marked ${context.item.name} not full`
          : `Marked ${context.item.name} full`;
        void context.runMutation(
          context.itemVerbs.setFull(context.item.id, !full),
          'full',
          message
        );
        return;
      }
      default: {
        const dialog = menuDialog(entry.id);
        if (dialog !== null) context.setDialog(dialog);
      }
    }
  };
}
