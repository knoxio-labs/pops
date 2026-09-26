import { Button, ButtonPrimitive, Checkbox, cn } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  LifecycleBadge,
  QuantityBadge,
  SyncBadge,
  TypeLabel,
} from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PlacementPath } from '../../foundation/badges/placement-path.js';
import { ListBody } from '../../foundation/list-page/list-states.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';

/** Props for the card view of the item list. */
export interface ItemsCardsProps {
  rows: readonly ItemRowModel[];
  total: number;
  world: PlacementWorld;
  selection: SelectionApi;
  onOpen: (id: string) => void;
  onLoadMore: () => void;
}

function Card({
  item,
  world,
  selection,
  onOpen,
}: {
  item: ItemRowModel;
  world: PlacementWorld;
  selection: SelectionApi;
  onOpen: (id: string) => void;
}): ReactElement {
  const selected = selection.isSelected(item.id);
  const focused = selection.state.focusedId === item.id;
  return (
    <div
      role="gridcell"
      aria-selected={selected}
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border bg-background p-2 transition-colors',
        selected ? 'border-app-accent/60 bg-app-accent/10' : 'hover:border-foreground/20',
        focused && 'ring-2 ring-ring'
      )}
    >
      <Checkbox
        className="absolute top-3 left-3 bg-background"
        checked={selected}
        aria-label={`Select ${item.name}`}
        onClick={(event) => {
          event.preventDefault();
          selection.onRowToggle(item.id, event.shiftKey);
        }}
      />
      <ItemMark item={item} size="md" />
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        className="h-auto justify-start px-0 text-left text-sm font-medium hover:bg-transparent"
        aria-label={`Open ${item.name}`}
        onClick={() => onOpen(item.id)}
      >
        <span className="line-clamp-1">{item.name}</span>
      </ButtonPrimitive>
      <span className="flex min-h-5 flex-wrap items-center gap-1">
        <TypeLabel typeName={item.typeName} />
        <QuantityBadge quantity={item.quantity} />
        <ContainerStateBadge container={item.container} />
        <LifecycleBadge lifecycle={item.lifecycle} />
        <SyncBadge sync={item.sync} />
      </span>
      <span className="flex items-center gap-2">
        <PlacementPath world={world} placement={item.placement} className="min-w-0 flex-1" />
        <CodeBadge code={item.code} />
      </span>
    </div>
  );
}

/** Renders the URL-selected card grid and its explicit load-more footer. */
export function ItemsCards({
  rows,
  total,
  world,
  selection,
  onOpen,
  onLoadMore,
}: ItemsCardsProps): ReactElement {
  const remaining = Math.max(total - rows.length, 0);
  return (
    <ListBody>
      <div
        role="grid"
        aria-label="Items as cards"
        aria-multiselectable
        tabIndex={0}
        className="grid grid-cols-2 gap-3 p-3 outline-none md:max-xl:grid-cols-3 xl:grid-cols-4"
        onKeyDown={(event) => {
          if (selection.onKey(event)) event.preventDefault();
        }}
      >
        {rows.map((item) => (
          <Card key={item.id} item={item} world={world} selection={selection} onOpen={onOpen} />
        ))}
      </div>
      {remaining > 0 ? (
        <div className="flex items-center justify-center gap-3 border-t py-3 text-xs text-muted-foreground">
          {`${rows.length.toLocaleString('en-AU')} of ${total.toLocaleString('en-AU')} shown`}
          <Button size="sm" variant="outline" onClick={onLoadMore}>
            Load {Math.min(remaining, 50)} more
          </Button>
        </div>
      ) : null}
    </ListBody>
  );
}
