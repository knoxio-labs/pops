import { Cable, Unlink } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { buildWorld } from '../../foundation/model/placement-model.js';
import { ItemList, ItemRow, RowVerb } from '../../foundation/rows/item-row.js';
import { SelectionBar } from '../../foundation/selection/selection-bar.js';

import type { ReactElement } from 'react';

import type { LocationModel, ItemRowModel } from '../../foundation/model/model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';

/** Props for the wired-item list and its selection actions. */
export interface FixtureWiredItemsProps {
  readonly fixtureName: string;
  readonly items: readonly ItemRowModel[];
  readonly locations: readonly LocationModel[];
  readonly selection: SelectionApi;
  readonly online: boolean;
  readonly disconnectingIds: ReadonlySet<string>;
  readonly hasNextPage: boolean;
  readonly onLoadMore: () => void;
  readonly onOpen: (id: string) => void;
  readonly onWire: () => void;
  readonly onDisconnect: (ids: readonly string[]) => void;
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
  disabledReason,
  onWire,
}: {
  readonly online: boolean;
  readonly disabledReason: string | undefined;
  readonly onWire: () => void;
}): ReactElement {
  return (
    <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
      <EmptyState
        icon={Cable}
        title="Nothing wired yet"
        description="Wire an inventory item to make this fixture part of its trace."
        action={
          <Button onClick={onWire} disabled={!online} title={disabledReason}>
            Wire items
          </Button>
        }
      />
    </div>
  );
}

function WiredItemList({
  fixtureName,
  items,
  world,
  selection,
  online,
  disconnectingIds,
  hasNextPage,
  onLoadMore,
  onOpen,
  onDisconnect,
}: Omit<FixtureWiredItemsProps, 'locations' | 'onWire'> & {
  readonly world: ReturnType<typeof buildWorld>;
}): ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <ItemList
        label={`Items wired to ${fixtureName}`}
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
      {hasNextPage ? (
        <div className="flex justify-center p-2">
          <Button variant="ghost" size="sm" onClick={onLoadMore}>
            Load more wired items
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function WiredItemsHeader({
  fixtureName,
  itemCount,
  online,
  disabledReason,
  onWire,
}: {
  readonly fixtureName: string;
  readonly itemCount: number;
  readonly online: boolean;
  readonly disabledReason: string | undefined;
  readonly onWire: () => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="wired-items-title" className="text-base font-semibold">
          Wired items
        </h2>
        <p className="text-sm text-muted-foreground">
          {itemCount} item{itemCount === 1 ? '' : 's'} wired to {fixtureName}.
        </p>
      </div>
      <Button
        onClick={onWire}
        disabled={!online}
        title={disabledReason}
        prefix={<Cable className="size-4" aria-hidden />}
      >
        Wire items
      </Button>
    </div>
  );
}

/** Renders wired items, selection, wiring entry, and guarded disconnect actions. */
export function FixtureWiredItems(props: FixtureWiredItemsProps): ReactElement {
  const world = buildWorld(props.items, props.locations);
  const disabledReason = props.online ? undefined : OFFLINE_REASON;
  const disconnectAction = {
    id: 'disconnect',
    label: 'Disconnect',
    icon: Unlink,
    disabledReason,
    onSelect: () => props.onDisconnect(props.selection.selectedIds),
  };
  const content =
    props.items.length === 0 ? (
      <WiredItemsEmpty
        online={props.online}
        disabledReason={disabledReason}
        onWire={props.onWire}
      />
    ) : (
      <WiredItemList
        fixtureName={props.fixtureName}
        items={props.items}
        world={world}
        selection={props.selection}
        online={props.online}
        disconnectingIds={props.disconnectingIds}
        hasNextPage={props.hasNextPage}
        onLoadMore={props.onLoadMore}
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
        itemCount={props.items.length}
        online={props.online}
        disabledReason={disabledReason}
        onWire={props.onWire}
      />
      <SelectionBar
        count={props.selection.count}
        loadedCount={props.items.length}
        coverage={props.selection.coverage}
        actions={[disconnectAction]}
        onSelectAll={props.selection.onHeaderToggle}
        onClear={props.selection.clearSelection}
      />
      {content}
    </section>
  );
}
