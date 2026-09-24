import { connectorOptions } from '@/fixtures/inventory-type-catalogue';
import { Archive, GripVertical, ListPlus, RotateCcw } from 'lucide-react';

import { Badge, Button, cn } from '@pops/ui';

import type { CatalogueEnumOption } from '@/fixtures/inventory-type-catalogue';

function OptionActions({ option }: { option: CatalogueEnumOption }) {
  if (option.archived === true) {
    return (
      <>
        <Badge variant="outline">Archived</Badge>
        <Button variant="ghost" size="sm" className="min-h-11">
          <RotateCcw className="h-4 w-4" />
          Restore
        </Button>
      </>
    );
  }
  return (
    <>
      <Button variant="ghost" size="sm" className="min-h-11">
        Edit
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label={`Archive ${option.label}`}
      >
        <Archive className="h-4 w-4" />
      </Button>
    </>
  );
}

/** Ordered enum options with published-use counts, archive and restore. */
export function EnumOptions() {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Options</h3>
          <p className="text-sm text-muted-foreground">
            Drag to set order. Archived options stay readable on existing items.
          </p>
        </div>
        <Button variant="outline" size="sm" className="min-h-11">
          <ListPlus className="h-4 w-4" />
          Add option
        </Button>
      </div>
      <div className="divide-y rounded-lg border">
        {connectorOptions.map((option) => (
          <div key={option.id} className="flex min-h-11 items-center gap-3 px-3 py-1">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block text-sm font-medium',
                  option.archived === true && 'text-muted-foreground line-through'
                )}
              >
                {option.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                <span className="font-mono">{option.key}</span> · {option.itemCount} items
              </span>
            </span>
            <OptionActions option={option} />
          </div>
        ))}
      </div>
    </section>
  );
}
