import { catalogueFieldsForType, electronicsFields } from '@/fixtures/inventory-type-catalogue';
import { Archive, ChevronDown, ChevronRight, ChevronUp, CircleDot, Plus } from 'lucide-react';

import { Button, cn } from '@pops/ui';

export { CatalogueList } from './catalogue-list';
export type { CatalogueListProps } from './catalogue-list';

import type {
  CatalogueFieldSummary,
  CatalogueTypeSummary,
} from '@/fixtures/inventory-type-catalogue';

function FieldMoveButtons({
  disabled,
  field,
  index,
  total,
}: {
  disabled: boolean;
  field: CatalogueFieldSummary;
  index: number;
  total: number;
}) {
  return (
    <div className="flex flex-col">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label={`Move ${field.label} up`}
        disabled={disabled || index === 0}
      >
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label={`Move ${field.label} down`}
        disabled={disabled || index === total - 1}
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  );
}

function FieldRow({
  field,
  index,
  selected,
  total,
}: {
  field: CatalogueFieldSummary;
  index: number;
  selected?: boolean;
  total: number;
}) {
  const isArchived = field.archived === true;
  return (
    <div
      className={cn(
        'flex min-h-11 items-center rounded-md border px-1 py-1',
        selected ? 'border-primary bg-primary/10' : 'border-transparent'
      )}
    >
      <FieldMoveButtons field={field} index={index} total={total} disabled={isArchived} />
      <button
        type="button"
        className="flex min-h-11 min-w-11 flex-1 items-center gap-2 px-1 py-1 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-medium', isArchived && 'line-through')}>
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
    </div>
  );
}

/** Ordered field outline with move up/down controls, matching the web editor's field order UI. */
export function FieldOutline({
  selectedKey,
  type,
}: {
  selectedKey: string;
  type?: CatalogueTypeSummary;
}) {
  const fields = type === undefined ? electronicsFields : catalogueFieldsForType(type.id);
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Fields</h2>
          <p className="text-xs text-muted-foreground">Set item form order</p>
        </div>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Field
        </Button>
      </div>
      <div className="space-y-1">
        {fields.map((field, index) => (
          <FieldRow
            key={field.id}
            field={field}
            index={index}
            total={fields.length}
            selected={field.key === selectedKey}
          />
        ))}
      </div>
      <Button variant="ghost" className="w-full justify-start text-muted-foreground">
        <Archive className="h-4 w-4" />1 archived field
      </Button>
    </section>
  );
}
