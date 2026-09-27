import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { OpenContainerRow, InHandRow } from './overview-panel-rows.js';
import { OverviewPanel, PanelEmpty } from './panel.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PanelContext } from './overview-panel-types.js';

/** Renders open containers with an optimistic Close action. */
export function OpenContainersPanel({
  rows,
  total,
  contentCounts,
  rejections,
  pendingIds,
  ctx,
  onClose,
}: {
  rows: readonly ItemRowModel[];
  total: number;
  contentCounts: Readonly<Record<string, { direct: number; deep: number }>>;
  rejections: Readonly<Record<string, string>>;
  pendingIds: ReadonlySet<string>;
  ctx: PanelContext;
  onClose: (item: ItemRowModel) => void;
}): ReactElement {
  const openRows = rows.filter((item) => item.container?.access === 'open');
  return (
    <OverviewPanel
      title="Open containers"
      icon={INVENTORY_ICONS.open}
      count={total}
      linkLabel="Containers"
      onLink={() => ctx.onNavigate('/inventory/containers?state=open')}
      empty={
        openRows.length === 0 ? <PanelEmpty>Every container is closed.</PanelEmpty> : undefined
      }
    >
      {openRows.map((item) => (
        <OpenContainerRow
          key={item.id}
          item={item}
          contentCounts={contentCounts}
          rejections={rejections}
          pendingIds={pendingIds}
          ctx={ctx}
          onClose={onClose}
        />
      ))}
    </OverviewPanel>
  );
}

/** Renders up to five in-hand items with Put back and Move actions. */
export function InHandPanel({
  items,
  total,
  rejections,
  pendingIds,
  ctx,
  onPutBack,
  onMove,
}: {
  items: readonly ItemRowModel[];
  total: number;
  rejections: Readonly<Record<string, string>>;
  pendingIds: ReadonlySet<string>;
  ctx: PanelContext;
  onPutBack: (item: ItemRowModel) => void;
  onMove: (item: ItemRowModel) => void;
}): ReactElement {
  const inHandItems = items.filter((item) => item.placement.kind === 'in-hand');
  const visibleItems = inHandItems.slice(0, 5);
  return (
    <OverviewPanel
      title="In hand"
      icon={INVENTORY_ICONS.inHand}
      count={total}
      linkLabel="In hand"
      onLink={() => ctx.onNavigate('/inventory/in-hand')}
      empty={visibleItems.length === 0 ? <PanelEmpty>Nothing is in hand.</PanelEmpty> : undefined}
    >
      {visibleItems.map((item) => (
        <InHandRow
          key={item.id}
          item={item}
          rejections={rejections}
          pendingIds={pendingIds}
          ctx={ctx}
          onPutBack={onPutBack}
          onMove={onMove}
        />
      ))}
    </OverviewPanel>
  );
}
