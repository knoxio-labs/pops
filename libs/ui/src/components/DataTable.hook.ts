import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useEffect, useState } from 'react';

import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

export interface UseDataTableArgs<TData, TValue> {
  data: TData[];
  columns: ColumnDef<TData, TValue>[];
  paginated: boolean;
  defaultPageSize: number;
  enableRowSelection: boolean;
  onSelectionChange?: (rows: TData[]) => void;
  filterFns?: Record<
    string,
    <TData>(row: TData, columnId: string, filterValue: unknown) => boolean
  >;
  /** Column filters the table opens with — e.g. a list reached via a link that already scopes it to one value. */
  initialColumnFilters?: ColumnFiltersState;
}

export function useDataTable<TData, TValue>({
  data,
  columns,
  paginated,
  defaultPageSize,
  enableRowSelection,
  onSelectionChange,
  filterFns,
  initialColumnFilters,
}: UseDataTableArgs<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialColumnFilters ?? []
  );
  const [columnVisibilityState, setColumnVisibilityState] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: paginated ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibilityState,
    onRowSelectionChange: setRowSelection,
    state: { sorting, columnFilters, columnVisibility: columnVisibilityState, rowSelection },
    initialState: { pagination: { pageSize: defaultPageSize } },
    enableRowSelection,
    filterFns,
  });

  // Notifying after commit, not during render: `useMemo` ran this in the
  // render pass, so a parent that stored the selection was updated while the
  // table was still rendering.
  useEffect(() => {
    if (!onSelectionChange || !enableRowSelection) return;
    const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
    onSelectionChange(selectedRows);
  }, [rowSelection, onSelectionChange, enableRowSelection, table]);

  return table;
}
