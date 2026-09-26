import { Button, ButtonPrimitive } from '@pops/ui';

import { ItemList, ItemRow } from '../rows/item-row.js';
import { ListBody } from './list-states.js';

import type { ReactElement } from 'react';

import type { ItemsSort } from '../../inventory-web/items-url-filters.js';
import type { ItemRowModel } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { SelectionApi } from '../selection/use-selection.js';

/** Props for the table view of the item list. */
export interface ItemsTableProps {
  label: string;
  rows: readonly ItemRowModel[];
  total: number;
  world: PlacementWorld;
  selection: SelectionApi;
  density: 'default' | 'compact';
  sort: ItemsSort;
  onSort: (sort: ItemsSort) => void;
  pendingIds: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onLoadMore: () => void;
}

const TABLE_COLUMNS: readonly { key: ItemsSort; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'where', label: 'Where' },
];

function TableHeader({ sort, onSort }: Pick<ItemsTableProps, 'sort' | 'onSort'>): ReactElement {
  return (
    <div
      role="row"
      className="flex h-9 items-center gap-3 border-b px-3 text-xs font-medium text-muted-foreground"
    >
      <span className="w-7 shrink-0" />
      {TABLE_COLUMNS.map((column) => (
        <ButtonPrimitive
          key={column.key}
          variant="ghost"
          size="xs"
          className="justify-start px-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
          aria-label={`Sort by ${column.label}`}
          aria-pressed={sort === column.key}
          onClick={() => onSort(column.key)}
        >
          {column.label}
        </ButtonPrimitive>
      ))}
      <span className="flex-1" />
      <span className="w-20 shrink-0">Code</span>
    </div>
  );
}

/** Renders the table or compact table view and its explicit load-more footer. */
export function ItemsTable({
  label,
  rows,
  total,
  world,
  selection,
  density,
  sort,
  onSort,
  pendingIds,
  onOpen,
  onLoadMore,
}: ItemsTableProps): ReactElement {
  const remaining = Math.max(total - rows.length, 0);
  return (
    <ListBody>
      <ItemList
        label={label}
        onKeyDown={(event) => {
          if (selection.onKey(event)) event.preventDefault();
        }}
      >
        <TableHeader sort={sort} onSort={onSort} />
        {rows.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            world={world}
            density={density === 'compact' ? 'compact' : 'comfortable'}
            selectable
            selected={selection.isSelected(item.id)}
            focused={selection.state.focusedId === item.id}
            pending={pendingIds.has(item.id)}
            onToggle={selection.onRowToggle}
            onOpen={onOpen}
          />
        ))}
      </ItemList>
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
