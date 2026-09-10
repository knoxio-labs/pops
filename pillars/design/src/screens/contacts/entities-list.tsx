import { entities, ENTITY_TYPE_LABEL, type Entity, type EntityType } from '@/fixtures/entities';
import { EntityFormDialog } from '@/kit/entity-form';
import { EntityAvatar } from '@/kit/entity-header';
import { useEntityDialog } from '@/kit/use-entity-dialog';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';

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
 * Entity-owned fields only: this list is contacts' own CRUD
 * surface, so it renders what a single `entities` row fetch already has. No
 * column here reaches into finance or purchases: a usage count or a "last
 * transaction" would mean one cross-pillar call per row, and that scales with
 * the list rather than with a page view. That kind of rollup belongs on the
 * details page, where it is one entity's worth of fetching, not a table's.
 */
const identityColumn: ColumnDef<Entity> = {
  accessorKey: 'name',
  header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
  cell: ({ row }) => (
    <div className="flex items-center gap-2.5">
      <EntityAvatar entity={row.original} />
      <span className="font-medium">{row.original.name}</span>
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
      {row.original.abn ?? <span className="text-muted-foreground">No ABN</span>}
    </span>
  ),
};

const aliasesColumn: ColumnDef<Entity> = {
  accessorKey: 'aliases',
  header: 'Aliases',
  cell: ({ row }) => {
    const aliases = row.original.aliases;
    if (!aliases || aliases.length === 0)
      return <span className="text-muted-foreground">No aliases</span>;
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
  const dialog = useEntityDialog();
  const columns = [
    identityColumn,
    typeColumn,
    abnColumn,
    aliasesColumn,
    buildActionsColumn({ onEdit: dialog.openWith }),
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Entities"
        description={`${rows.length} entities`}
        actions={
          <Button prefix={<Plus className="h-4 w-4" />} onClick={() => dialog.openWith(null)}>
            Add entity
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchColumn="name"
        searchPlaceholder="Search entities…"
        paginated
        defaultPageSize={50}
        filters={ENTITY_TABLE_FILTERS}
      />
      <EntityFormDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={dialog.setOpen}
        entity={dialog.entity}
      />
    </div>
  );
}

export const states: ScreenStates = {
  empty: () => <EntitiesListPage rows={[]} />,
};

export default function EntitiesListScreen() {
  return <EntitiesListPage rows={entities} />;
}
