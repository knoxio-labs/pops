/**
 * The card grid, for browsing by photo: the same selection model and badges
 * as the table, one card per item, and a "Load more" footer instead of
 * infinite scroll (spec 3.1), so the grid never jumps under the pointer.
 */
import { Button, ButtonPrimitive, Checkbox, cn } from '@pops/ui';

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
import { ListBody } from './list-page';

import type { ItemRowModel, PlacementWorld, SelectionApi } from '../foundation';

/** Props for {@link ItemsCards}. */
export interface ItemsCardsProps {
  rows: readonly ItemRowModel[];
  total: number;
  world: PlacementWorld;
  selection: SelectionApi;
  onOpen?: (id: string) => void;
}

function Picture({ item }: { item: ItemRowModel }) {
  const Icon = item.container === null ? INVENTORY_ICONS.item : INVENTORY_ICONS.container;
  return (
    <span
      className={cn(
        'flex h-24 items-center justify-center overflow-hidden rounded-md',
        item.container === null
          ? 'bg-muted text-muted-foreground'
          : 'bg-app-accent/10 text-app-accent'
      )}
    >
      {item.photoUrl === null ? (
        <Icon className="size-8" aria-hidden />
      ) : (
        <img src={item.photoUrl} alt="" className="size-full object-cover" />
      )}
    </span>
  );
}

function Card({
  item,
  world,
  selection,
  onOpen,
}: { item: ItemRowModel } & Omit<ItemsCardsProps, 'rows' | 'total'>) {
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
      <Picture item={item} />
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        className="h-auto justify-start px-0 text-left text-sm font-medium hover:bg-transparent"
        aria-label={`Open ${item.name}`}
        onClick={() => onOpen?.(item.id)}
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

/** The card grid. */
export function ItemsCards(props: ItemsCardsProps) {
  const { rows, total, selection } = props;
  const remaining = total - rows.length;
  return (
    <ListBody>
      <div
        role="grid"
        aria-label="Items as cards"
        aria-multiselectable
        tabIndex={0}
        className="grid grid-cols-2 gap-3 p-3 outline-none md:grid-cols-3 xl:grid-cols-4"
        onKeyDown={(event) => {
          if (selection.onKey(event)) event.preventDefault();
        }}
      >
        {rows.map((item) => (
          <Card key={item.id} item={item} {...props} />
        ))}
      </div>
      {remaining > 0 ? (
        <div className="flex items-center justify-center gap-3 border-t py-3 text-xs text-muted-foreground">
          {`${rows.length.toLocaleString('en-AU')} of ${total.toLocaleString('en-AU')} shown`}
          <Button size="sm" variant="outline">
            Load {Math.min(remaining, 48)} more
          </Button>
        </div>
      ) : null}
    </ListBody>
  );
}
