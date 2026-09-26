import { richTelevision } from '@/fixtures/inventory/item-states';
import { containerStates } from '@/kit/inventory/container-workspace/container-states';
import { detailState, itemDetailStates } from '@/kit/inventory/item-detail/detail-states';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { DetailLayout } from '@/kit/inventory/item-detail/detail-model';

export const meta: ScreenMeta = { title: 'Item detail', order: 11, frame: 'web' };

/**
 * `/inventory/items/:id`: one item, and the verbs that move it. A container
 * renders at the same URL with its contents-first workspace. Every state is
 * built for a layout so the E1 variants stage the same states; E1 chose
 * the split view (facts rail beside tabs), which the screen renders.
 */
export function createItemDetailStates(layout: DetailLayout): ScreenStates {
  return { ...itemDetailStates(layout), ...containerStates };
}

/** The default render for a layout: the rich Television with Connections open. */
export function itemDetailDefault(layout: DetailLayout) {
  return detailState(layout, richTelevision, { openSection: 'connections' });
}

export const states: ScreenStates = createItemDetailStates('rail-tabs');

const RailTabsDefault = itemDetailDefault('rail-tabs');

export default function ItemDetailScreen() {
  return <RailTabsDefault />;
}
