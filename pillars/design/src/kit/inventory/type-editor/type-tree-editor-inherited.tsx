import {
  catalogueFieldsForType,
  inventoryCatalogueTypes,
} from '@/fixtures/inventory-type-catalogue';
import { typePath } from '@/kit/inventory/type-tree/model';
import { ExternalLink, GitBranch } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import type { CatalogueFieldSummary } from '@/fixtures/inventory-type-fields';

function FieldLine({
  field,
  inherited,
  owner,
}: {
  field: CatalogueFieldSummary;
  inherited?: boolean;
  owner?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-md border px-3',
        inherited && 'bg-muted/30'
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn('block truncate text-sm font-medium', inherited && 'text-muted-foreground')}
        >
          {field.label}
        </span>
        <span className="block text-xs text-muted-foreground">
          {field.kind} · {field.cardinality}
          {owner === undefined ? '' : ` · From ${owner}`}
        </span>
      </span>
      {inherited ? (
        <Button variant="ghost" size="sm" className="shrink-0">
          <ExternalLink className="size-3.5" aria-hidden />
          Edit on {owner}
        </Button>
      ) : (
        <Button variant="ghost" size="icon" aria-label={`Edit ${field.label}`}>
          <GitBranch className="size-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}

/** The inherited field groups for the Pillowcase state. */
export function InheritedFields() {
  const path = typePath(inventoryCatalogueTypes, 'type-pillowcase');
  const ancestors = path.slice(0, -1);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <p className="font-medium">Inherited fields are read-only here</p>
        <p className="mt-1 text-muted-foreground">
          Pillowcase receives the same field ids and capabilities from its ancestors. Edit the owner
          type to change them.
        </p>
      </div>
      {ancestors.map((ancestor) => (
        <section key={ancestor.id} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">From {ancestor.label}</h3>
            <Button variant="link" size="sm" className="h-auto px-0">
              Edit on {ancestor.label}
            </Button>
          </div>
          <div className="space-y-1.5">
            {catalogueFieldsForType(ancestor.id).map((field) => (
              <FieldLine
                key={`${ancestor.id}-${field.id}`}
                field={field}
                inherited
                owner={ancestor.label}
              />
            ))}
          </div>
        </section>
      ))}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Pillowcase fields</h3>
        {catalogueFieldsForType('type-pillowcase').map((field) => (
          <FieldLine key={field.id} field={field} />
        ))}
      </section>
    </div>
  );
}
