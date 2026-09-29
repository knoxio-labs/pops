import { LayoutRailTabs } from './layout-rail-tabs';

import type { ReactElement } from 'react';

import type { DetailTab, ItemDetailModel } from './detail-model';
import type { FactEditing } from './use-fact-editing';

/** Composes the item-detail model with the split rail and tab surface. */
export function ItemDetailView({
  itemId,
  model,
  tab,
  readOnly,
  onTab,
  onLinksChanged,
  editing,
  onQuantity,
}: {
  itemId: string;
  model: ItemDetailModel;
  tab: DetailTab;
  readOnly: boolean;
  onTab: (tab: DetailTab) => void;
  onLinksChanged: () => void;
  editing?: FactEditing;
  onQuantity?: (action: 'split' | 'change') => void;
}): ReactElement {
  return (
    <LayoutRailTabs
      itemId={itemId}
      model={model}
      tab={tab}
      readOnly={readOnly}
      onTab={onTab}
      onLinksChanged={onLinksChanged}
      editing={editing}
      onQuantity={onQuantity}
    />
  );
}
