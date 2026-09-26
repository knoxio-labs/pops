/**
 * Column definitions for items in `DataTable` / `InfiniteScrollTable`, the
 * table view of the same row shape {@link ItemRow} draws. Selection is the
 * shared model's, not the table's own, so Shift-range and `x` behave the
 * same in a table as in a list.
 */
import { Checkbox, SortableHeader, formatDate } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  LifecycleBadge,
  QuantityBadge,
  SyncBadge,
  TypeLabel,
} from './badges';
import { ItemMark } from './item-mark';
import { PlacementPath } from './placement-path';

import type { ColumnDef } from '@tanstack/react-table';

import type { ItemRowModel } from './model';
import type { PlacementWorld } from './placement-model';
import type { SelectionApi } from './use-selection';

/** Column ids units may hide; tablet width drops `updated` and `note` (spec 3.10). */
export type ItemColumnId = 'select' | 'name' | 'type' | 'placement' | 'state' | 'code' | 'updated';

/** Options for {@link itemTableColumns}. */
export interface ItemTableColumnOptions {
  world: PlacementWorld;
  selection?: SelectionApi;
  hidden?: readonly ItemColumnId[];
}

function selectColumn(selection: SelectionApi): ColumnDef<ItemRowModel> {
  return {
    id: 'select',
    header: () => (
      <Checkbox
        aria-label="Select all loaded rows"
        checked={selection.coverage === 'some' ? 'indeterminate' : selection.coverage === 'all'}
        onClick={(event) => {
          event.preventDefault();
          selection.onHeaderToggle();
        }}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select ${row.original.name}`}
        checked={selection.isSelected(row.original.id)}
        onClick={(event) => {
          event.preventDefault();
          selection.onRowToggle(row.original.id, event.shiftKey);
        }}
      />
    ),
  };
}

function dataColumns(world: PlacementWorld): ColumnDef<ItemRowModel>[] {
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2">
          <ItemMark item={row.original} />
          <span className="truncate font-medium">{row.original.name}</span>
          <QuantityBadge quantity={row.original.quantity} />
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => <TypeLabel typeName={row.original.typeName} />,
    },
    {
      id: 'placement',
      header: 'Where',
      cell: ({ row }) => (
        <PlacementPath world={world} placement={row.original.placement} maxSegments={2} />
      ),
    },
    {
      id: 'state',
      header: 'State',
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          <ContainerStateBadge container={row.original.container} />
          <LifecycleBadge lifecycle={row.original.lifecycle} />
          <SyncBadge sync={row.original.sync} />
        </span>
      ),
    },
    { id: 'code', header: 'Code', cell: ({ row }) => <CodeBadge code={row.original.code} /> },
    {
      id: 'updated',
      accessorKey: 'updatedAt',
      header: ({ column }) => <SortableHeader column={column}>Updated</SortableHeader>,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatDate(row.original.updatedAt)}
        </span>
      ),
    },
  ];
}

/** The item table's columns, selection first when a selection is given. */
export function itemTableColumns({
  world,
  selection,
  hidden = [],
}: ItemTableColumnOptions): ColumnDef<ItemRowModel>[] {
  const columns = selection ? [selectColumn(selection), ...dataColumns(world)] : dataColumns(world);
  return columns.filter((column) => !hidden.some((id) => id === column.id));
}
