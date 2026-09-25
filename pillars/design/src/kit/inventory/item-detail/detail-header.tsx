/**
 * The top of an item page, in the POPS page header's shape (accent tile,
 * bold title, one line under it, actions right): what the item is, the
 * states it is in, where it is, and the way back to the list it came from
 * with previous and next. The title truncates rather than pushing the verbs
 * off the row.
 */
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  INVENTORY_ICONS,
  LifecycleBadge,
  PlacementPath,
  QuantityBadge,
  SyncBadge,
  TypeLabel,
} from '../foundation';
import { VerbButton } from './verb-button';

import type { ReactNode } from 'react';

import type { ItemRowModel, PlacementWorld } from '../foundation';

/** Where this item sits in the list it was opened from. */
export interface ListPosition {
  listName: string;
  index: number;
  total: number;
}

function BackRow({ position }: { position: ListPosition }) {
  return (
    <div className="flex h-8 items-center gap-1 text-xs text-muted-foreground">
      <Button
        variant="link"
        size="sm"
        className="h-6 gap-1 px-0 text-xs text-muted-foreground"
        prefix={<ArrowLeft className="size-3.5" aria-hidden />}
      >
        {position.listName}
      </Button>
      <span className="ml-2 tabular-nums">
        {position.index} of {position.total}
      </span>
      <VerbButton
        label="Previous item"
        icon={ChevronLeft}
        iconOnly
        compact
        variant="ghost"
        shortcutId="detail-previous"
      />
      <VerbButton
        label="Next item"
        icon={ChevronRight}
        iconOnly
        compact
        variant="ghost"
        shortcutId="detail-next"
      />
    </div>
  );
}

function MetaLine({
  item,
  world,
  extra,
}: {
  item: ItemRowModel;
  world: PlacementWorld;
  extra?: ReactNode;
}) {
  const previous = item.placement.kind === 'in-hand' ? item.previous : null;
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <PlacementPath
        world={world}
        placement={item.placement}
        maxSegments={4}
        className="max-w-full"
      />
      {previous !== null ? (
        <span className="inline-flex min-w-0 items-center gap-1">
          from
          <PlacementPath world={world} placement={previous} maxSegments={3} />
        </span>
      ) : null}
      <TypeLabel typeName={item.typeName} />
      <CodeBadge code={item.code} showNone />
      {extra}
    </p>
  );
}

/** Props for {@link DetailHeader}. */
export interface DetailHeaderProps {
  item: ItemRowModel;
  world: PlacementWorld;
  position?: ListPosition;
  actions: ReactNode;
  /** Extra meta after the code: a container's content count. */
  meta?: ReactNode;
}

/** The item page header. */
export function DetailHeader({ item, world, position, actions, meta }: DetailHeaderProps) {
  const Icon = item.container === null ? INVENTORY_ICONS.item : INVENTORY_ICONS.container;
  return (
    <header className="flex shrink-0 flex-col gap-1">
      {position ? <BackRow position={position} /> : null}
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-app-accent/15">
            <Icon className="size-5 text-app-accent" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1
                className={cn(
                  'truncate text-2xl font-bold tracking-tight md:text-3xl',
                  item.lifecycle === 'destroyed' && 'text-muted-foreground'
                )}
                title={item.name}
              >
                {item.name}
              </h1>
              <span className="flex shrink-0 items-center gap-1">
                <QuantityBadge quantity={item.quantity} />
                <ContainerStateBadge container={item.container} />
                <LifecycleBadge lifecycle={item.lifecycle} />
                <SyncBadge sync={item.sync} />
              </span>
            </div>
            <MetaLine item={item} world={world} extra={meta} />
          </div>
        </div>
        {actions}
      </div>
    </header>
  );
}
