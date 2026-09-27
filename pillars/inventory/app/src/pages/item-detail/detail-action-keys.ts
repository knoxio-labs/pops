import { itemPath, findMenuEntry, findVerb } from './detail-action-helpers';

import type { NavigateFunction } from 'react-router';

import type { ItemRowModel } from '../../foundation/model';
import type { ShortcutHandlers } from '../../foundation/shortcuts/shortcut-provider';
import type { DetailVerb, DetailVerbs, MenuEntry } from './detail-verbs';
import type { DetailTrailPosition } from './use-detail-actions';

/** Dependencies used to build the item-detail keyboard shortcut handlers. */
export interface DetailKeyHandlerContext {
  item: ItemRowModel;
  verbs: DetailVerbs;
  position: DetailTrailPosition | null;
  navigate: NavigateFunction;
  onVerb: (verb: DetailVerb) => void;
  onMenu: (entry: MenuEntry) => void;
}

function navigateToTrailItem(
  navigate: NavigateFunction,
  position: DetailTrailPosition | null,
  id: string
): void {
  void navigate(
    itemPath(id),
    position?.trailState === undefined ? undefined : { state: position.trailState }
  );
}

/** Creates the stable shortcut map for the item-detail page scope. */
export function createDetailKeyHandlers(context: DetailKeyHandlerContext): ShortcutHandlers {
  const runVerb = (id: DetailVerb['id']): boolean => {
    const verb = findVerb(context.verbs, id);
    if (verb === null || verb.disabledReason !== undefined) return false;
    context.onVerb(verb);
    return true;
  };
  const runMenu = (id: string): boolean => {
    const entry = findMenuEntry(context.verbs, id);
    if (entry === null || entry.disabledReason !== undefined) return false;
    context.onMenu(entry);
    return true;
  };

  return {
    'detail-edit': () => runVerb('edit'),
    'detail-place': () =>
      runVerb(context.verbs.primary?.id === 'put-back' ? 'put-back' : 'pick-up'),
    'detail-move': () => runVerb('move'),
    'detail-open-close': () =>
      runVerb(context.item.container?.access === 'open' ? 'close' : 'open'),
    'detail-copy-code': () => runMenu('copy-code'),
    'detail-history': () => runMenu('history'),
    'detail-previous': () => {
      const id = context.position?.previousId;
      if (id === null || id === undefined) return false;
      navigateToTrailItem(context.navigate, context.position, id);
      return true;
    },
    'detail-next': () => {
      const id = context.position?.nextId;
      if (id === null || id === undefined) return false;
      navigateToTrailItem(context.navigate, context.position, id);
      return true;
    },
  };
}
