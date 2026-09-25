import { detailVerbs } from './detail-verbs';
/**
 * Everything an item page derives before it draws: whether it is read-only,
 * its verbs and sections, the undo offer, dialogs and picker state, and the
 * detail keys wired to the verbs they name.
 */
import { detailSections } from './sections';
import { useDetailActions } from './use-detail-actions';
import { useDetailKeys } from './use-detail-keys';
import { useUndoToast } from './use-undo-toast';

import type { ExitKind } from '../container-workspace/unpack-model';
import type { WorkspaceSeed } from '../container-workspace/workspace';
import type { DetailDialog } from './detail-dialogs';
import type { DetailCondition, ItemDetailModel } from './detail-model';
import type { DetailVerbs } from './detail-verbs';

function keyHandlers(verbs: DetailVerbs, run: (id: string) => void, open: boolean) {
  return {
    'detail-place': () => run(verbs.primary?.id === 'put-back' ? 'put-back' : 'pick-up'),
    'detail-move': () => run('move'),
    'detail-open-close': () => run(open ? 'close' : 'open'),
  };
}

function exitMessage(count: number, how: ExitKind): string {
  const things = count === 1 ? '1 item' : `${count} items`;
  return `${how === 'pick-up' ? 'Picked up' : 'Took out'} ${things}`;
}

/** The page's derived state and handlers. */
export function useItemDetailPage(
  model: ItemDetailModel,
  condition: DetailCondition,
  initial: { dialog: DetailDialog | null; workspace?: WorkspaceSeed }
) {
  const offline = condition.banner === 'offline';
  const readOnly = offline || model.item.lifecycle === 'destroyed';
  const verbs = detailVerbs(model.item, model.world, { offline });
  const sections = detailSections(model, readOnly);
  const toast = useUndoToast(
    condition.toast ? { state: 'offered', ...condition.toast } : null,
    condition.toast !== undefined
  );
  const actions = useDetailActions(model, toast, {
    dialog: initial.dialog,
    picker: condition.pickerOpen,
    storeHere: initial.workspace?.storeHereOpen,
  });
  const run = (id: string) => {
    const verb = [verbs.primary, ...verbs.secondary].find((entry) => entry?.id === id);
    if (verb) actions.onVerb(verb);
  };
  useDetailKeys(keyHandlers(verbs, run, model.item.container?.access === 'open'));
  const onExit = (count: number, how: ExitKind) =>
    toast.show(how === 'pick-up' ? 'pickUp' : 'takeOut', exitMessage(count, how));
  const onQuantity = (action: 'split' | 'change') =>
    actions.setDialog(action === 'split' ? 'split' : 'change-quantity');
  return { readOnly, verbs, sections, toast, actions, onExit, onQuantity };
}
