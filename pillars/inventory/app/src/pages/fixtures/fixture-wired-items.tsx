import { Cable, Unlink } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { ListError } from '../../foundation/list-page/list-states.js';
import { ItemList, ItemRow, RowVerb } from '../../foundation/rows/item-row.js';
import { SelectionBar } from '../../foundation/selection/selection-bar.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';

/** Props for the wired-item list and its selection actions. */
export interface FixtureWiredItemsProps {
  readonly fixtureName: string;
  readonly items: readonly ItemRowModel[];
  readonly total: number | null;
  readonly status: 'pending' | 'error' | 'success';
  readonly world: PlacementWorld;
  readonly selection: SelectionApi;
  readonly online: boolean;
  readonly disconnectingIds: ReadonlySet<string>;
  readonly onOpen: (id: string) => void;
  readonly onWire: () => void;
  readonly onDisconnect: (ids: readonly string[]) => void;
  readonly onRetry: () => void;
}

function disconnectDisabledReason(
  online: boolean,
  disconnectingIds: ReadonlySet<string>,
  itemId: string
): string | undefined {
  if (!online) return OFFLINE_REASON;
  return disconnectingIds.has(itemId) ? 'Disconnecting…' : undefined;
}

function WiredItemsEmpty({
  online,
  onWire,
}: {
  readonly online: boolean;
  readonly onWire: () => void;
}): ReactElement {
  return (
    <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
      <EmptyState
        icon={Cable}
        title="Nothing is wired to this fixture"
        description="Wire the lamp, charger or router that uses it, so tracing that item ends here."
        action={
          <Button onClick={onWire} disabled={!online} title={!online ? OFFLINE_REASON : undefined}>
            Wire items
          </Button>
        }
      />
    </div>
  );
}

function WiredItemList({
  items,
  world,
  selection,
  online,
  disconnectingIds,
  onOpen,
  onDisconnect,
}: Pick<
  FixtureWiredItemsProps,
  'items' | 'world' | 'selection' | 'online' | 'disconnectingIds' | 'onOpen' | 'onDisconnect'
>): ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <ItemList
        label="Wired items"
        onKeyDown={(event) => {
          if (selection.onKey(event)) event.preventDefault();
        }}
      >
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            world={world}
            density="comfortable"
            selectable
            selected={selection.isSelected(item.id)}
            onToggle={selection.onRowToggle}
            onOpen={onOpen}
            verbs={
              <RowVerb
                icon={Unlink}
                label="Disconnect"
                disabledReason={disconnectDisabledReason(online, disconnectingIds, item.id)}
                onClick={() => onDisconnect([item.id])}
              />
            }
          />
        ))}
      </ItemList>
    </div>
  );
}

function WiredItemsHeader({
  fixtureName,
  total,
  online,
  onWire,
}: {
  readonly fixtureName: string;
  readonly total: number;
  readonly online: boolean;
  readonly onWire: () => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="wired-items-title" className="text-base font-semibold">
        Wired to this fixture: {total}
      </h2>
      <Button
        onClick={onWire}
        disabled={!online}
        title={!online ? OFFLINE_REASON : undefined}
        prefix={<Cable className="size-4" aria-hidden />}
      >
        Wire items
      </Button>
      <span className="sr-only">{fixtureName}</span>
    </div>
  );
}

function WiredItemsError({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" aria-label="Wired items">
      <ListError noun="wired items" onRetry={onRetry} />
    </section>
  );
}

/** Renders wired items, selection, wiring entry, and guarded disconnect actions. */
export function FixtureWiredItems(props: FixtureWiredItemsProps): ReactElement {
  if (props.status === 'error' || props.total === null)
    return <WiredItemsError onRetry={props.onRetry} />;
  const disabledReason = props.online ? undefined : OFFLINE_REASON;
  const content =
    props.items.length === 0 ? (
      <WiredItemsEmpty online={props.online} onWire={props.onWire} />
    ) : (
      <WiredItemList
        items={props.items}
        world={props.world}
        selection={props.selection}
        online={props.online}
        disconnectingIds={props.disconnectingIds}
        onOpen={props.onOpen}
        onDisconnect={props.onDisconnect}
      />
    );
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
      aria-labelledby="wired-items-title"
    >
      <WiredItemsHeader
        fixtureName={props.fixtureName}
        total={props.total}
        online={props.online}
        onWire={props.onWire}
      />
      <SelectionBar
        count={props.selection.count}
        loadedCount={props.items.length}
        coverage={props.selection.coverage}
        actions={[
          {
            id: 'disconnect',
            label: `Disconnect ${props.selection.count}`,
            icon: Unlink,
            disabledReason,
            onSelect: () => props.onDisconnect(props.selection.selectedIds),
          },
        ]}
        onSelectAll={props.selection.onHeaderToggle}
        onClear={props.selection.clearSelection}
      />
      {content}
    </section>
  );
}
