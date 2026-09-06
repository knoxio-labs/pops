import { entities, ENTITY_TYPE_LABEL, type Entity, type EntityType } from '@/fixtures/entities';
import { EntityAvatar } from '@/kit/entity-header';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  Badge,
  Button,
  type ColumnFilter,
  DataTable,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  PageHeader,
  SortableHeader,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ColumnDef } from '@tanstack/react-table';

export const meta: ScreenMeta = { title: 'Entities', order: 2, frame: 'web' };

/**
 * The name column gains the identity fields (POPS-2805) without becoming a
 * second header: the avatar carries colour and image, "Orphaned" stays a
 * badge on the name itself, because that is a status about this entity, not
 * an attribute of how it looks.
 */
const identityColumn: ColumnDef<Entity> = {
  accessorKey: 'name',
  header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
  cell: ({ row }) => (
    <div className="flex items-center gap-2.5">
      <EntityAvatar entity={row.original} />
      <span className="font-medium">{row.original.name}</span>
      {row.original.transactionCount === 0 && (
        <Badge
          variant="outline"
          className="text-xs text-muted-foreground border-muted-foreground/30"
        >
          Orphaned
        </Badge>
      )}
    </div>
  ),
};

const typeColumn: ColumnDef<Entity> = {
  accessorKey: 'type',
  header: 'Type',
  cell: ({ row }) => (
    <Badge variant="outline" className="text-xs">
      {ENTITY_TYPE_LABEL[row.original.type]}
    </Badge>
  ),
};

const abnColumn: ColumnDef<Entity> = {
  accessorKey: 'abn',
  header: 'ABN',
  cell: ({ row }) => (
    <span className="text-sm font-mono">
      {row.original.abn ?? <span className="text-muted-foreground">—</span>}
    </span>
  ),
};

const aliasesColumn: ColumnDef<Entity> = {
  accessorKey: 'aliases',
  header: 'Aliases',
  cell: ({ row }) => {
    const aliases = row.original.aliases;
    if (!aliases || aliases.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {aliases.slice(0, 2).map((alias) => (
          <Badge key={alias} variant="secondary" className="text-xs">
            {alias}
          </Badge>
        ))}
        {aliases.length > 2 && (
          <Badge variant="secondary" className="text-xs">
            +{aliases.length - 2}
          </Badge>
        )}
      </div>
    );
  },
};

const defaultTypeColumn: ColumnDef<Entity> = {
  accessorKey: 'defaultTransactionType',
  header: 'Default Type',
  cell: ({ row }) => (
    <span className="text-sm">
      {row.original.defaultTransactionType ?? <span className="text-muted-foreground">—</span>}
    </span>
  ),
};

function buildActionsColumn(args: { onEdit: (entity: Entity) => void }): ColumnDef<Entity> {
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
          <DropdownMenuItem className="text-destructive focus:text-destructive">
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    ),
  };
}

const ENTITY_TABLE_FILTERS: ColumnFilter[] = [
  {
    id: 'type',
    type: 'select',
    label: 'Type',
    options: [
      { label: 'All types', value: '' },
      ...(Object.entries(ENTITY_TYPE_LABEL) as [EntityType, string][]).map(([value, label]) => ({
        label,
        value,
      })),
    ],
  },
];

export function EntitiesListPage({ rows }: { rows: Entity[] }) {
  const [showOrphanedOnly, setShowOrphanedOnly] = useState(false);
  const visible = showOrphanedOnly ? rows.filter((e) => e.transactionCount === 0) : rows;
  const columns = [
    identityColumn,
    typeColumn,
    abnColumn,
    aliasesColumn,
    defaultTypeColumn,
    buildActionsColumn({ onEdit: () => {} }),
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Entities"
        description={
          showOrphanedOnly
            ? `${visible.length} orphaned entit${visible.length === 1 ? 'y' : 'ies'} — no matched transactions`
            : `${rows.length} entities`
        }
        actions={<Button prefix={<Plus className="h-4 w-4" />}>Add entity</Button>}
      />
      <div className="flex items-center gap-2">
        <Button
          variant={showOrphanedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOrphanedOnly((prev) => !prev)}
        >
          {showOrphanedOnly ? 'Showing orphaned only' : 'Show orphaned only'}
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={visible}
        searchable
        searchColumn="name"
        searchPlaceholder="Search entities…"
        paginated
        defaultPageSize={50}
        filters={ENTITY_TABLE_FILTERS}
      />
    </div>
  );
}

export const states: ScreenStates = {
  empty: () => <EntitiesListPage rows={[]} />,
  orphaned: () => <EntitiesListPage rows={entities.filter((e) => e.transactionCount === 0)} />,
};

export default function EntitiesListScreen() {
  return <EntitiesListPage rows={entities} />;
}
