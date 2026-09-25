/**
 * `/inventory/in-hand`: the pocket. Everything picked up and not yet put
 * anywhere, where each came from, and the two verbs that empty it. The list
 * is the only thing that scrolls.
 */
import { useMemo } from 'react';

import { Button, Card, EmptyState, Skeleton } from '@pops/ui';

import { LoadError, ToastDock } from '../overview/inventory-page';
import { HintTooltip } from '../shared/hint-tooltip';
import { INVENTORY_ICONS } from '../shared/icons';
import { ItemList } from '../shared/item-row';
import { ShortcutHint } from '../shared/kbd';
import { InventoryPage } from '../shared/page-frame';
import { SelectionBar } from '../shared/selection-bar';
import { useSelection } from '../shared/use-selection';
import { orderInHand, planPutBackAll } from './in-hand-model';
import { InHandRow } from './in-hand-row';

import type { ReactNode } from 'react';

import type { SelectionBarAction } from '../shared/contracts';
import type { ItemRowModel } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';
import type { SelectionState } from '../shared/use-selection';

/** Props for {@link InHandPage}. */
export interface InHandPageProps {
  world: PlacementWorld;
  items: readonly ItemRowModel[];
  body?: 'list' | 'loading' | 'error';
  initialSelection?: SelectionState;
  banner?: ReactNode;
  disabledReason?: string;
  /** Drawn over the list: an open picker, anchored under a row. */
  overlay?: ReactNode;
  toast?: ReactNode;
}

const I = INVENTORY_ICONS;

function PutBackAllButton({
  items,
  disabledReason,
}: {
  items: readonly ItemRowModel[];
  disabledReason?: string;
}) {
  const plan = planPutBackAll(items);
  const reason = disabledReason ?? plan.disabledReason ?? undefined;
  return (
    <HintTooltip label={plan.label} disabledReason={reason}>
      <Button
        aria-disabled={reason !== undefined || undefined}
        className={reason === undefined ? undefined : 'opacity-50'}
        prefix={<I.putBack className="size-4" aria-hidden />}
      >
        {plan.label}
      </Button>
    </HintTooltip>
  );
}

function Summary({ items }: { items: readonly ItemRowModel[] }) {
  const plan = planPutBackAll(items);
  return (
    <p className="shrink-0 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{items.length} in hand.</span>{' '}
      {plan.returnable.length} can go back where they came from
      {plan.stranded.length > 0 ? `, ${plan.stranded.length} need a place chosen.` : '.'}
    </p>
  );
}

function selectionActions(disabledReason?: string): SelectionBarAction[] {
  return [
    { id: 'put-back', label: 'Put back', icon: I.putBack, shortcutId: 'put-back', disabledReason },
    { id: 'move', label: 'Move', icon: I.move, shortcutId: 'move', disabledReason },
    { id: 'label', label: 'Label', icon: I.label, shortcutId: 'label' },
  ];
}

function List({ world, items: given, initialSelection, disabledReason, overlay }: InHandPageProps) {
  const items = useMemo(() => orderInHand(given), [given]);
  const order = useMemo(() => items.map((entry) => entry.id), [items]);
  const selection = useSelection(order, initialSelection);
  return (
    <>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto">
          <ItemList
            label="In hand"
            onKeyDown={(event) => selection.onKey(event) && event.preventDefault()}
          >
            {items.map((item) => (
              <InHandRow
                key={item.id}
                item={item}
                world={world}
                selected={selection.isSelected(item.id)}
                focused={selection.state.focusedId === item.id}
                disabledReason={disabledReason}
                onToggle={selection.onRowToggle}
              />
            ))}
          </ItemList>
        </div>
        {overlay}
      </div>
      <SelectionBar
        count={selection.count}
        loadedCount={items.length}
        coverage={selection.coverage}
        actions={selectionActions(disabledReason)}
        onSelectAll={selection.onHeaderToggle}
        onClear={selection.clearSelection}
        className="shrink-0"
      />
    </>
  );
}

function Empty() {
  return (
    <Card className="mx-auto mt-6 w-full max-w-lg">
      <EmptyState
        icon={I.inHand}
        title="Nothing in hand"
        description="Pick something up from any list or item page with P. It waits here until you put it back or move it."
        size="md"
      />
    </Card>
  );
}

function Loading() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading in hand">
      <Skeleton className="h-5 w-80" />
      <Skeleton className="h-60 w-full rounded-lg" />
    </div>
  );
}

/** The In hand page. */
export function InHandPage(props: InHandPageProps) {
  const body = props.body ?? 'list';
  const hasItems = props.items.length > 0;
  return (
    <InventoryPage
      title="In hand"
      icon={I.inHand}
      banner={props.banner}
      bodyClassName="gap-3"
      actions={
        hasItems && body === 'list' ? (
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-xs text-muted-foreground xl:inline-flex">
              <ShortcutHint id="put-back" /> puts back the focused row
            </span>
            <PutBackAllButton items={props.items} disabledReason={props.disabledReason} />
          </div>
        ) : undefined
      }
      overlay={props.toast ? <ToastDock>{props.toast}</ToastDock> : undefined}
    >
      {body === 'loading' ? <Loading /> : null}
      {body === 'error' ? (
        <LoadError
          title="In hand did not load"
          detail="The list request failed. Nothing was put back or moved."
        />
      ) : null}
      {body === 'list' && !hasItems ? <Empty /> : null}
      {body === 'list' && hasItems ? (
        <>
          <Summary items={props.items} />
          <List {...props} />
        </>
      ) : null}
    </InventoryPage>
  );
}
