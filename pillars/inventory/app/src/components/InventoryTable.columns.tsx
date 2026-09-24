import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { Button, Checkbox, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@pops/ui';

import type { ColumnDef } from '@tanstack/react-table';

export interface InventoryTableItem {
  id: string;
  itemName: string;
  brand: string | null;
  type: string | null;
  condition: string | null;
  location: string | null;
  locationId: string | null;
  replacementValue: number | null;
  purchaseDate: string | null;
  inUse: boolean;
  assetId: string | null;
}

export function buildActionsColumn(args: {
  onEdit: (id: string) => void;
  onDeleteRequest: (id: string) => void;
}): ColumnDef<InventoryTableItem> {
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
          <DropdownMenuItem onClick={() => args.onEdit(row.original.id)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => args.onDeleteRequest(row.original.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    ),
  };
}

export function buildSelectColumn(): ColumnDef<InventoryTableItem> {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
        aria-label="Select all items on this page"
      />
    ),
    cell: ({ row }) => (
      <div onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(value === true)}
          aria-label={`Select ${row.original.itemName}`}
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  };
}
