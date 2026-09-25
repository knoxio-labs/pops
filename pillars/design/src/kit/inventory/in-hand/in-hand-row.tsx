/**
 * One in-hand row: select, the item, where it came from (or why it has
 * nowhere to go back to), and Put back and Move. Put back names its
 * destination in its tooltip, so the outcome is known before the click.
 */
import { Checkbox, cn } from '@pops/ui';

import { PlaceName } from '../overview/place-name';
import { CodeBadge, QuantityBadge, SyncBadge } from '../shared/badges';
import { INVENTORY_ICONS } from '../shared/icons';
import { ItemMark } from '../shared/item-mark';
import { RowVerb } from '../shared/item-row';
import { targetName } from '../shared/placement-model';
import { returnRoute } from './in-hand-model';

import type { ItemRowModel } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';

/** Props for {@link InHandRow}. */
export interface InHandRowProps {
  item: ItemRowModel;
  world: PlacementWorld;
  selected: boolean;
  focused?: boolean;
  /** Mutations are off: both verbs say why. */
  disabledReason?: string;
  onToggle?: (id: string, shiftKey: boolean) => void;
  onMove?: (id: string) => void;
}

function Origin({ item, world }: { item: ItemRowModel; world: PlacementWorld }) {
  const route = returnRoute(item);
  if (route.kind === 'back') {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">Came from</span>
        <PlaceName world={world} target={route.to} className="text-foreground" />
      </span>
    );
  }
  const text =
    route.kind === 'deleted'
      ? `${route.name} was deleted. Choose a new place`
      : 'Found loose, never placed. Choose a place';
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
      <INVENTORY_ICONS.needsAttention className="size-3.5 shrink-0 text-warning" aria-hidden />
      <span className="truncate">{text}</span>
    </span>
  );
}

function putBackState(item: ItemRowModel, world: PlacementWorld, offline?: string) {
  const route = returnRoute(item);
  if (route.kind !== 'back')
    return { label: 'Put back', reason: 'No place to go back to. Use Move' };
  return { label: `Put back in ${targetName(world, route.to)}`, reason: offline };
}

/** The row. */
export function InHandRow({
  item,
  world,
  selected,
  focused,
  disabledReason,
  onToggle,
  onMove,
}: InHandRowProps) {
  const putBack = putBackState(item, world, disabledReason);
  return (
    <div
      role="row"
      aria-selected={selected}
      className={cn(
        'grid h-12 grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1.25fr)_auto_auto] items-center gap-3 pr-2 pl-3',
        selected ? 'bg-app-accent/10' : 'hover:bg-muted/60',
        focused && 'ring-2 ring-inset ring-ring'
      )}
    >
      <Checkbox
        checked={selected}
        aria-label={`Select ${item.name}`}
        onClick={(event) => {
          event.preventDefault();
          onToggle?.(item.id, event.shiftKey);
        }}
      />
      <ItemMark item={item} />
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-medium">{item.name}</span>
        <QuantityBadge quantity={item.quantity} />
        <SyncBadge sync={item.sync} />
      </span>
      <Origin item={item} world={world} />
      <span className="hidden lg:inline-flex">
        <CodeBadge code={item.code} />
      </span>
      <span className="flex items-center gap-0.5">
        <RowVerb
          icon={INVENTORY_ICONS.putBack}
          label={putBack.label}
          shortcutId="put-back"
          disabledReason={putBack.reason}
        />
        <RowVerb
          icon={INVENTORY_ICONS.move}
          label={`Move ${item.name}`}
          shortcutId="move"
          disabledReason={disabledReason}
          onClick={() => onMove?.(item.id)}
        />
      </span>
    </div>
  );
}
