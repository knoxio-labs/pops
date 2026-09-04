import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  SortableHeader,
} from '@pops/ui';

import type { ColumnDef } from '@tanstack/react-table';

import type { Currency } from './types';

const codeColumn: ColumnDef<Currency> = {
  accessorKey: 'code',
  header: ({ column }) => <SortableHeader column={column}>Code</SortableHeader>,
  cell: ({ row }) => <div className="font-mono font-medium">{row.original.code}</div>,
};

const nameColumn: ColumnDef<Currency> = {
  accessorKey: 'name',
  header: 'Name',
  cell: ({ row }) => row.original.name,
};

const symbolColumn: ColumnDef<Currency> = {
  accessorKey: 'symbol',
  header: 'Symbol',
  cell: ({ row }) => row.original.symbol ?? <span className="text-muted-foreground">—</span>,
};

const decimalsColumn: ColumnDef<Currency> = {
  accessorKey: 'decimals',
  header: 'Decimals',
  cell: ({ row }) => row.original.decimals,
};

const kindColumn: ColumnDef<Currency> = {
  accessorKey: 'kind',
  header: 'Kind',
  cell: ({ row }) => (
    <Badge variant="outline" className="capitalize">
      {row.original.kind}
    </Badge>
  ),
};

function buildActionsColumn(args: {
  onEdit: (c: Currency) => void;
  onDelete: (code: string) => void;
}): ColumnDef<Currency> {
  return {
    id: 'actions',
    cell: ({ row }) => (
      <div className="text-right">
        <DropdownMenu
          trigger={
            <Button variant="ghost" size="icon" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
          align="end"
        >
          <DropdownMenuItem onClick={() => args.onEdit(row.original)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => args.onDelete(row.original.code)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    ),
  };
}

export function buildCurrencyColumns(args: {
  onEdit: (c: Currency) => void;
  onDelete: (code: string) => void;
}): ColumnDef<Currency>[] {
  return [
    codeColumn,
    nameColumn,
    symbolColumn,
    decimalsColumn,
    kindColumn,
    buildActionsColumn(args),
  ];
}
