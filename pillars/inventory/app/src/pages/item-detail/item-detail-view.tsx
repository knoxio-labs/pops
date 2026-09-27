import { LayoutRailTabs } from './layout-rail-tabs';

import type { ReactElement } from 'react';

import type { DetailTab, ItemDetailModel } from './detail-model';

/** Composes the item-detail model with the split rail and tab surface. */
export function ItemDetailView({
  itemId,
  model,
  tab,
  readOnly,
  onTab,
  onLinksChanged,
}: {
  itemId: string;
  model: ItemDetailModel;
  tab: DetailTab;
  readOnly: boolean;
  onTab: (tab: DetailTab) => void;
  onLinksChanged: () => void;
}): ReactElement {
  return (
    <LayoutRailTabs
      itemId={itemId}
      model={model}
      tab={tab}
      readOnly={readOnly}
      onTab={onTab}
      onLinksChanged={onLinksChanged}
    />
  );
}
