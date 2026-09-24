import { catalogueTypes, electronicsFields } from '@/fixtures/inventory-type-catalogue';
import {
  Archive,
  Boxes,
  ChevronRight,
  CircleDot,
  Eye,
  GripVertical,
  Plus,
  Search,
} from 'lucide-react';

import { Badge, Button, Input, cn } from '@pops/ui';

import type {
  CatalogueFieldSummary,
  CatalogueTypeSummary,
} from '@/fixtures/inventory-type-catalogue';

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

function TypeRow({ type, selected }: { type: CatalogueTypeSummary; selected?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-11 w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'
      )}
    >
      <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{type.label}</span>
          <TypeStatus type={type} />
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {type.itemCount} items · {type.fieldCount} fields
        </span>
      </span>
    </button>
  );
}

/** Type catalogue navigation used by the list screen and workspace layout. */
export function CatalogueList({ compact = false }: { compact?: boolean }) {
  return (
    <section className={cn('space-y-4', !compact && 'rounded-xl border bg-card p-5')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Item types</h2>
          <p className="text-sm text-muted-foreground">Published revision 12 · 4 types</p>
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
          className="min-h-11 pl-9"
        />
      </div>
      <div className="space-y-1">
        {catalogueTypes.map((type) => (
          <TypeRow key={type.id} type={type} selected={compact && type.id === 'type-electronics'} />
        ))}
      </div>
      <Button variant="outline" className="w-full">
        <Eye className="h-4 w-4" />
        Show archived
      </Button>
    </section>
  );
}

function FieldRow({ field, selected }: { field: CatalogueFieldSummary; selected?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'group flex min-h-11 w-full items-center gap-2 rounded-md border px-2 py-2 text-left',
        selected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'
      )}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span
          className={cn('block truncate text-sm font-medium', field.archived && 'line-through')}
        >
          {field.label}
        </span>
        <span className="block text-xs text-muted-foreground">
          {field.storage === 'computed' ? 'Computed · ' : ''}
          {field.kind} · {field.cardinality}
        </span>
      </span>
      {field.required && <CircleDot className="h-3.5 w-3.5 text-primary" aria-label="Required" />}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

/** Ordered field navigation shared by both type-editor layouts. */
export function FieldOutline({ selectedKey }: { selectedKey: string }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Fields</h2>
          <p className="text-xs text-muted-foreground">Drag to set form order</p>
        </div>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Field
        </Button>
      </div>
      <div className="space-y-1">
        {electronicsFields.map((field) => (
          <FieldRow key={field.id} field={field} selected={field.key === selectedKey} />
        ))}
      </div>
      <Button variant="ghost" className="w-full justify-start text-muted-foreground">
        <Archive className="h-4 w-4" />1 archived field
      </Button>
    </section>
  );
}
