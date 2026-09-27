import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

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
import { VerbButton } from '../../foundation/item-page/verb-button';
import { INVENTORY_ICONS } from '../../foundation/model/icons';

import type { ReactElement, ReactNode } from 'react';

import type { ItemRowModel } from '../../foundation/model/model';
import type { PlacementWorld } from '../../foundation/model/placement-model';
import type { TrailPosition } from '../../inventory-web/list-trail';

/** Props for the item identity, list trail, and action row above the split view. */
export interface DetailHeaderProps {
  item: ItemRowModel;
  world: PlacementWorld;
  position?: TrailPosition | null;
  actions?: ReactNode;
  onPrevious?: () => void;
  onNext?: () => void;
}

function BackRow({
  position,
  onPrevious,
  onNext,
}: Pick<DetailHeaderProps, 'position' | 'onPrevious' | 'onNext'>): ReactElement | null {
  if (position === undefined || position === null) return null;
  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      data-testid="item-detail-back-row"
    >
      <Link className="font-medium text-foreground hover:underline" to={position.href}>
        {position.listName}
      </Link>
      <span>
        {position.index} of {position.total}
      </span>
      <span className="ml-auto inline-flex items-center gap-1">
        <VerbButton
          label="Previous item"
          icon={ChevronLeft}
          iconOnly
          size="sm"
          variant="ghost"
          disabledReason={position.previousId === null ? 'Already at the first item.' : undefined}
          onClick={onPrevious}
        />
        <VerbButton
          label="Next item"
          icon={ChevronRight}
          iconOnly
          size="sm"
          variant="ghost"
          disabledReason={position.nextId === null ? 'Already at the last item.' : undefined}
          onClick={onNext}
        />
      </span>
    </div>
  );
}

/** Renders the item identity, list trail, and action row above the split view. */
export function DetailHeader({
  item,
  world,
  position,
  actions,
  onPrevious,
  onNext,
}: DetailHeaderProps): ReactElement {
  const Icon = item.container === null ? INVENTORY_ICONS.item : INVENTORY_ICONS.container;
  const titleClass = item.lifecycle === 'destroyed' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <header className="flex min-w-0 flex-col gap-2" data-testid="item-detail-header">
      <BackRow position={position} onPrevious={onPrevious} onNext={onNext} />
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <AccentTile icon={Icon} size="lg" />
        <div className="min-w-0 flex-1">
          <h1
            className={`truncate text-2xl font-extrabold tracking-tight md:text-3xl ${titleClass}`}
          >
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
        {actions}
      </div>
    </header>
  );
}
