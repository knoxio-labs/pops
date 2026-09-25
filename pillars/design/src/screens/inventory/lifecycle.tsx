import { kitchen12Contents, kitchen12Workspace } from '@/fixtures/inventory/container-workspace';
import {
  destroyedPhone,
  discardedSpeaker,
  groupedCables,
  lostUmbrella,
  retiredCamera,
  richTelevision,
} from '@/fixtures/inventory/item-states';
import { recentPlacements } from '@/fixtures/inventory/recents';
import { EMPTY_SELECTION } from '@/kit/inventory/foundation';
import { ItemDetailPage } from '@/kit/inventory/item-detail/item-detail-page';
import { LifecycleDialog } from '@/kit/inventory/lifecycle/lifecycle-dialog';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ItemRowModel } from '@/kit/inventory/foundation';
import type { DetailDialog } from '@/kit/inventory/item-detail/detail-dialogs';
import type { DetailCondition, ItemDetailModel } from '@/kit/inventory/item-detail/detail-model';

export const meta: ScreenMeta = { title: 'Lifecycle', order: 4, frame: 'web' };

function open(
  model: ItemDetailModel,
  dialog: DetailDialog | null,
  condition: DetailCondition = {}
) {
  return function LifecycleState() {
    return (
      <ItemDetailPage
        model={model}
        initialDialog={dialog}
        condition={condition}
        recents={recentPlacements}
      />
    );
  };
}

const active: ItemRowModel = { ...richTelevision.item, lifecycle: 'active' };

/** The same item before the act: active, with only its creation recorded. */
function beforeAct(model: ItemDetailModel): ItemDetailModel {
  return {
    ...model,
    item: { ...model.item, lifecycle: 'active' },
    lifecycleEvent: undefined,
    events: richTelevision.events
      .slice(-1)
      .map((event) => ({ ...event, itemId: model.item.id, itemName: model.item.name })),
  };
}
const box = kitchen12Workspace('open');
const six = kitchen12Contents(box).slice(0, 6);

/**
 * The lifecycle acts, each opened from an item's More menu over its page:
 * reversible acts ask only for a reason and offer Undo after; Destroy is the
 * one alert dialog and the one red button. Bulk acts count their subject.
 */
export const states: ScreenStates = {
  retire: open(beforeAct(retiredCamera), 'retire'),
  lost: open(beforeAct(lostUmbrella), 'lost'),
  destroy: open(beforeAct(destroyedPhone), 'destroy'),
  restore: open(lostUmbrella, 'restore'),
  split: open(groupedCables, 'split'),
  'change-quantity': open(groupedCables, 'change-quantity'),
  'undo-conflict': open({ ...richTelevision, item: active }, null, {
    toast: { concept: 'move', message: 'Moved Television to Garage', state: 'conflict' },
  }),
  'bulk-retire': () => (
    <>
      <ItemDetailPage
        model={box}
        recents={recentPlacements}
        workspace={{
          selection: {
            ...EMPTY_SELECTION,
            selected: new Set(six),
            anchorId: six[0] ?? null,
            focusedId: null,
          },
        }}
      />
      <LifecycleDialog act="retire" subject={six.length} open onOpenChange={() => undefined} />
    </>
  ),
};

const DiscardDefault = open(beforeAct(discardedSpeaker), 'discard');

export default function LifecycleScreen() {
  return <DiscardDefault />;
}
