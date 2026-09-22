import { Archive, Boxes, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge, Button, Input, cn } from '@pops/ui';

import type { CatalogueType } from './types';

interface TypeListProps {
  readonly onCreate: () => void;
  readonly onSelect: (id: string) => void;
  readonly selectedId: string | null;
  readonly types: readonly CatalogueType[];
}

function matchesType(type: CatalogueType, needle: string, showArchived: boolean): boolean {
  return (
    (showArchived || type.archivedAt === null) &&
    (needle.length === 0 ||
      type.label.toLocaleLowerCase().includes(needle) ||
      type.key.toLocaleLowerCase().includes(needle))
  );
}

/** Searchable catalogue type navigation matching the decided playground layout. */
export function TypeList({ onCreate, onSelect, selectedId, types }: TypeListProps) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const visibleTypes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return types.filter((type) => matchesType(type, needle, showArchived));
  }, [query, showArchived, types]);
  const archivedCount = types.filter((type) => type.archivedAt !== null).length;
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Item types</h2>
          <p className="text-sm text-muted-foreground">{types.length} definitions</p>
        </div>
        <Button size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          New type
        </Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Search item types"
          placeholder="Search types"
          className="min-h-11 pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        {visibleTypes.map((type) => (
          <TypeListItem
            key={type.id}
            type={type}
            selected={selectedId === type.id}
            onSelect={onSelect}
          />
        ))}
        {visibleTypes.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No matching types.</p>
        )}
      </div>
      {archivedCount > 0 && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowArchived((shown) => !shown)}
        >
          <Archive className="h-4 w-4" />
          {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
        </Button>
      )}
    </section>
  );
}

function TypeListItem({
  onSelect,
  selected,
  type,
}: {
  readonly onSelect: (id: string) => void;
  readonly selected: boolean;
  readonly type: CatalogueType;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(type.id)}
      className="flex min-h-11 min-w-11 w-full items-start gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10"
    >
      <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'truncate text-sm font-medium',
              type.archivedAt !== null && 'line-through'
            )}
          >
            {type.label}
          </span>
          {type.archivedAt !== null && <Badge variant="outline">Archived</Badge>}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {type.fields.length} fields · <span className="font-mono">{type.key}</span>
        </span>
      </span>
    </button>
  );
}
