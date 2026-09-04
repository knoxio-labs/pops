import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  SortableHeader,
} from '@pops/ui';

import type { ColumnDef } from '@tanstack/react-table';

import type { Institution } from './types';

const swatchColumn: ColumnDef<Institution> = {
  id: 'swatch',
  header: '',
  cell: ({ row }) => (
    <span
      className="inline-block h-4 w-4 rounded-full border border-border"
      style={{ backgroundColor: row.original.colour }}
      aria-hidden="true"
    />
  ),
};

const nameColumn: ColumnDef<Institution> = {
  accessorKey: 'name',
  header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
  cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
};

const colourColumn: ColumnDef<Institution> = {
  accessorKey: 'colour',
  header: 'Colour',
  cell: ({ row }) => (
    <span className="font-mono text-sm text-muted-foreground">{row.original.colour}</span>
  ),
};

function buildActionsColumn(args: {
  onEdit: (i: Institution) => void;
  onDelete: (id: string) => void;
}): ColumnDef<Institution> {
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
            onClick={() => args.onDelete(row.original.id)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    ),
  };
}

export function buildInstitutionColumns(args: {
  onEdit: (i: Institution) => void;
  onDelete: (id: string) => void;
}): ColumnDef<Institution>[] {
  return [swatchColumn, nameColumn, colourColumn, buildActionsColumn(args)];
}
