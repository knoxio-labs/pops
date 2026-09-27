import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { cn } from '@pops/ui';

import { PAGE_HEIGHT } from '../../foundation/item-page/section-parts';
import { DetailTabs, FactsRail } from './detail-tabs-view';
import { RailSplitter } from './rail-splitter';

import type { CSSProperties, ReactElement } from 'react';

import type { DetailTab, ItemDetailModel } from './detail-model';
import type { FactEditing } from './use-fact-editing';

interface RailStyle extends CSSProperties {
  '--rail-width': string;
}

/** Renders the URL-backed tabs and resizable desktop facts rail. */
export function LayoutRailTabs({
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
  const navigate = useNavigate();
  const [railWidth, setRailWidth] = useState(288);
  const railStyle = useMemo<RailStyle>(() => ({ '--rail-width': `${railWidth}px` }), [railWidth]);
  const typePath = `/inventory/items/${itemId}/edit?focus=type`;
  const onSetType = () => navigate(typePath);
  return (
    <div className={cn(PAGE_HEIGHT, '@container flex min-h-0 flex-col gap-4')}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 @2xl:flex-row" style={railStyle}>
        <FactsRail
          model={model}
          readOnly={readOnly}
          onSetType={onSetType}
          editing={editing}
          onQuantity={onQuantity}
        />
        <RailSplitter width={railWidth} onWidth={setRailWidth} />
        <DetailTabs
          itemId={itemId}
          model={model}
          tab={tab}
          readOnly={readOnly}
          onSetType={onSetType}
          onTab={onTab}
          onLinksChanged={onLinksChanged}
          editing={editing}
          onQuantity={onQuantity}
        />
      </div>
    </div>
  );
}
