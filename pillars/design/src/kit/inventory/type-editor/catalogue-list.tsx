import { catalogueTypes } from '@/fixtures/inventory-type-catalogue';
import { typeTreeOptions } from '@/kit/inventory/type-tree/model';
import { Boxes, Plus, Search } from 'lucide-react';

import { Badge, Button, Input, cn } from '@pops/ui';

import type { CatalogueTypeSummary } from '@/fixtures/inventory-type-catalogue';

const statusTone: Record<CatalogueTypeSummary['status'], string> = {
  published: 'border-border bg-muted text-muted-foreground',
  draft: 'border-primary/30 bg-primary/10 text-primary',
  archived: 'border-border bg-muted text-muted-foreground line-through',
};

function TypeStatus({ type }: { type: CatalogueTypeSummary }) {
  return (
    <Badge variant="outline" className={cn('capitalize', statusTone[type.status])}>
      {type.status}
    </Badge>
  );
}

const DEPTH_PADDING: Readonly<Record<number, string>> = {
  1: 'pl-3',
  2: 'pl-8',
  3: 'pl-13',
};

function TypeRow({
  type,
  selected,
  depth = 1,
  pathLabel,
}: {
  type: CatalogueTypeSummary;
  selected?: boolean;
  depth?: number;
  pathLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex min-h-11 w-full items-start gap-3 rounded-lg border py-2.5 pr-3 text-left transition-colors',
        DEPTH_PADDING[depth] ?? DEPTH_PADDING[3],
        type.status === 'archived' && 'opacity-60',
        selected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'
      )}
    >
      <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{type.label}</span>
          <TypeStatus type={type} />
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {pathLabel !== undefined && pathLabel !== type.label ? `${pathLabel} · ` : ''}
          {type.itemCount} items · {type.fieldCount} fields
        </span>
      </span>
    </button>
  );
}

/** Props for {@link CatalogueList}. */
export interface CatalogueListProps {
  compact?: boolean;
  types?: readonly CatalogueTypeSummary[];
  selectedId?: string;
  searchQuery?: string;
  showArchived?: boolean;
}

/** The type catalogue tree used by the editor and its finished states. */
export function CatalogueList({
  compact = false,
  types = catalogueTypes,
  selectedId = 'type-electronics',
  searchQuery = '',
  showArchived = true,
}: CatalogueListProps) {
  const options = typeTreeOptions(types, searchQuery, showArchived);
  const byId = new Map(types.map((type) => [type.id, type]));
  const published = types.filter((type) => type.status !== 'archived').length;
  return (
    <section className={cn('space-y-4', !compact && 'rounded-xl border bg-card p-5')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Item types</h2>
          <p className="text-sm text-muted-foreground">
            Published revision 12 · {published} active types
          </p>
        </div>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New type
        </Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Search item types"
          placeholder="Search types"
          value={searchQuery}
          readOnly
          className="min-h-11 pl-9"
        />
      </div>
      <div className="space-y-1">
        {options.map((option) => {
          const type = byId.get(option.value);
          return type === undefined ? null : (
            <TypeRow
              key={type.id}
              type={type}
              depth={option.depth}
              pathLabel={option.pathLabel}
              selected={type.id === selectedId}
            />
          );
        })}
      </div>
      <Button variant="outline" className="w-full">
        Show archived
      </Button>
    </section>
  );
}
