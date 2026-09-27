import {
  CodeBadge,
  ContainerStateBadge,
  LifecycleBadge,
  QuantityBadge,
  SyncBadge,
  TypeLabel,
} from '../../foundation/badges/badges';
import { PlacementPath } from '../../foundation/badges/placement-path';
import { AccentTile } from '../../foundation/frame/page-frame';
import { INVENTORY_ICONS } from '../../foundation/model/icons';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model';
import type { PlacementWorld } from '../../foundation/model/placement-model';

/** Renders the item identity and read-only metadata above the split view. */
export function DetailHeader({
  item,
  world,
}: {
  item: ItemRowModel;
  world: PlacementWorld;
}): ReactElement {
  const Icon = item.container === null ? INVENTORY_ICONS.item : INVENTORY_ICONS.container;
  const titleClass = item.lifecycle === 'destroyed' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <header className="flex min-w-0 items-start gap-3" data-testid="item-detail-header">
      <AccentTile icon={Icon} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className={`truncate text-2xl font-extrabold tracking-tight md:text-3xl ${titleClass}`}>
          {item.name}
        </h1>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <QuantityBadge quantity={item.quantity} />
          <ContainerStateBadge container={item.container} />
          <LifecycleBadge lifecycle={item.lifecycle} />
          <SyncBadge sync={item.sync} />
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <PlacementPath world={world} placement={item.placement} maxSegments={4} />
          {item.previous ? (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span>from</span>
              <PlacementPath world={world} placement={item.previous} maxSegments={3} />
            </span>
          ) : null}
          <TypeLabel typeName={item.typeName} />
          <CodeBadge code={item.code} showNone />
        </div>
      </div>
    </header>
  );
}
