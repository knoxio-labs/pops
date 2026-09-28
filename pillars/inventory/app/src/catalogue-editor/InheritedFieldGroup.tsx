import { Button, cn } from '@pops/ui';

import type { CatalogueField, CatalogueType } from './types';

/** Renders an ancestor's fields as read-only entries with an owner shortcut. */
export function InheritedFieldGroup({
  ancestor,
  fields,
  onSelectType,
}: {
  readonly ancestor: CatalogueType;
  readonly fields: readonly CatalogueField[];
  readonly onSelectType?: (id: string) => void;
}) {
  return (
    <section aria-label={`From ${ancestor.label}`} className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">From {ancestor.label}</h4>
        {onSelectType !== undefined && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0"
            onClick={() => onSelectType(ancestor.id)}
          >
            Edit on {ancestor.label}
          </Button>
        )}
      </div>
      <div className="space-y-1">
        {fields.map((field) => (
          <div
            key={`${ancestor.id}-${field.id}`}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-md border px-3',
              'bg-muted/30 text-muted-foreground',
              field.archivedAt !== null && 'opacity-60'
            )}
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate text-sm font-medium',
                  field.archivedAt !== null && 'line-through'
                )}
              >
                {field.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {field.storage === 'computed' ? 'Computed · ' : ''}
                {field.kind} · {field.cardinality}
              </span>
            </span>
            <span className="shrink-0 text-xs">Read-only</span>
          </div>
        ))}
      </div>
    </section>
  );
}
