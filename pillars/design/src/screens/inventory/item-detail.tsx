import { richTelevision } from '@/fixtures/inventory/item-states';
import { containerStates } from '@/kit/inventory/container-workspace/container-states';
import { detailState, itemDetailStates } from '@/kit/inventory/item-detail/detail-states';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { DetailLayout } from '@/kit/inventory/item-detail/detail-model';

export const meta: ScreenMeta = { title: 'Item detail', order: 2, frame: 'web' };

/**
 * `/inventory/items/:id`: one item, and the verbs that move it. A container
 * renders at the same URL with its contents-first workspace. Every state is
 * built for a layout so the E1 variants stage the same states.
 */
export function createItemDetailStates(layout: DetailLayout): ScreenStates {
  return { ...itemDetailStates(layout), ...containerStates };
}

/** The default render for a layout: the rich Television with Connections open. */
export function itemDetailDefault(layout: DetailLayout) {
  return detailState(layout, richTelevision, { openSection: 'connections' });
}

export const states: ScreenStates = createItemDetailStates('stacked');

const StackedDefault = itemDetailDefault('stacked');

export default function ItemDetailScreen() {
  return <StackedDefault />;
}
