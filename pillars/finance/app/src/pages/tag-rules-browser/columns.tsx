import { Ban, Pencil, Trash2 } from 'lucide-react';

import { Badge, Button, Chip, formatDate, hashToColor, SortableHeader } from '@pops/ui';

import type { ColumnDef } from '@tanstack/react-table';

import type { TagRule } from './types';

type BuildOptions = {
  entityNames: Map<string, string>;
  onEditClick: (rule: TagRule) => void;
  onDisableClick: (id: string) => void;
  onDeleteClick: (id: string) => void;
  isDisablePending: (id: string) => boolean;
};

const patternColumn: ColumnDef<TagRule> = {
  accessorKey: 'descriptionPattern',
  header: ({ column }) => <SortableHeader column={column}>Pattern</SortableHeader>,
  cell: ({ row }) => <span className="font-mono text-sm">{row.original.descriptionPattern}</span>,
};

const matchTypeColumn: ColumnDef<TagRule> = {
  accessorKey: 'matchType',
  header: 'Match Type',
  cell: ({ row }) => <Badge variant="outline">{row.original.matchType}</Badge>,
};

function entityColumn(entityNames: Map<string, string>): ColumnDef<TagRule> {
  return {
    accessorKey: 'entityId',
    header: ({ column }) => <SortableHeader column={column}>Entity</SortableHeader>,
    cell: ({ row }) => {
      const { entityId } = row.original;
      if (!entityId) return <span className="text-muted-foreground">Global</span>;
      return entityNames.get(entityId) ?? <span className="text-muted-foreground">—</span>;
    },
  };
}

const tagsColumn: ColumnDef<TagRule> = {
  accessorKey: 'tags',
  header: 'Tags',
  cell: ({ row }) => (
    <div className="flex flex-wrap gap-1">
      {row.original.tags.map((tag) => (
        <Chip key={tag} size="sm" style={hashToColor(tag)}>
          {tag}
        </Chip>
      ))}
    </div>
  ),
};

const confidenceColumn: ColumnDef<TagRule> = {
  accessorKey: 'confidence',
  header: ({ column }) => <SortableHeader column={column}>Confidence</SortableHeader>,
  cell: ({ row }) => (
    <span className="tabular-nums">{(row.original.confidence * 100).toFixed(0)}%</span>
  ),
};

const priorityColumn: ColumnDef<TagRule> = {
  accessorKey: 'priority',
  header: ({ column }) => <SortableHeader column={column}>Priority</SortableHeader>,
  cell: ({ row }) => <span className="tabular-nums">{row.original.priority}</span>,
};

const timesAppliedColumn: ColumnDef<TagRule> = {
  accessorKey: 'timesApplied',
  header: ({ column }) => (
    <div className="flex justify-end">
      <SortableHeader column={column}>Times Applied</SortableHeader>
    </div>
  ),
  cell: ({ row }) => <div className="text-right tabular-nums">{row.original.timesApplied}</div>,
};

const lastUsedColumn: ColumnDef<TagRule> = {
  accessorKey: 'lastUsedAt',
  header: ({ column }) => <SortableHeader column={column}>Last Used</SortableHeader>,
  cell: ({ row }) =>
    row.original.lastUsedAt ? (
      formatDate(row.original.lastUsedAt)
    ) : (
      <span className="text-muted-foreground">Never</span>
    ),
};

const activeColumn: ColumnDef<TagRule> = {
  accessorKey: 'isActive',
  header: 'Status',
  cell: ({ row }) =>
    row.original.isActive ? (
      <Badge className="border-transparent bg-success text-white">Active</Badge>
    ) : (
      <Badge variant="outline">Disabled</Badge>
    ),
};

function actionsColumn(options: BuildOptions): ColumnDef<TagRule> {
  const { onEditClick, onDisableClick, onDeleteClick, isDisablePending } = options;
  return {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onEditClick(row.original);
          }}
          aria-label={`Edit tag rule ${row.original.descriptionPattern}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {row.original.isActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDisableClick(row.original.id);
            }}
            disabled={isDisablePending(row.original.id)}
            aria-label={`Disable tag rule ${row.original.descriptionPattern}`}
          >
            <Ban className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteClick(row.original.id);
          }}
          aria-label={`Delete tag rule ${row.original.descriptionPattern}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    ),
  };
}

export function buildTagRulesColumns(options: BuildOptions): ColumnDef<TagRule>[] {
  return [
    patternColumn,
    matchTypeColumn,
    entityColumn(options.entityNames),
    tagsColumn,
    confidenceColumn,
    priorityColumn,
    timesAppliedColumn,
    lastUsedColumn,
    activeColumn,
    actionsColumn(options),
  ];
}
