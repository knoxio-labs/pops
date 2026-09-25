/**
 * Picks the preview for the active result: an item or container, a place,
 * or a purchase.
 */
import { ItemPreview, PlacePreview } from './preview-pane';
import { PurchasePreview } from './purchase-preview';
import { parentPath } from './results-list';

import type { PlacementWorld } from '../foundation';
import type { PurchaseResult } from './purchase-model';
import type { SearchPageState } from './use-search-page';

/** The preview of whatever row is active, or nothing. */
export function ActivePreview({
  page,
  world,
  purchases,
}: {
  page: SearchPageState;
  world: PlacementWorld;
  purchases: readonly PurchaseResult[];
}) {
  const id = page.activeId;
  if (id === null) return null;
  if (page.scope === 'purchases') {
    const purchase = page.purchases.find((entry) => entry.id === id);
    return purchase ? <PurchasePreview purchase={purchase} world={world} /> : null;
  }
  const item = world.items.get(id);
  if (item) {
    const boughtIn = purchases.find((entry) => entry.lines.some((line) => line.itemId === id));
    return <ItemPreview item={item} world={world} boughtIn={boughtIn} />;
  }
  const place = world.locations.get(id);
  return place ? <PlacePreview place={place} path={parentPath(world, id)} world={world} /> : null;
}
