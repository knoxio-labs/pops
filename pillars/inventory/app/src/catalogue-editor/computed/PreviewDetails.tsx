import { ChevronRight } from 'lucide-react';

import { Badge, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import type { PreviewDependency, PreviewItem } from './preview-model';

/** The items a calculation walked through, in the order it followed references. */
export function TraversedItems({ items }: { items: readonly PreviewItem[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Items traversed">
      {items.map((item, index) => (
        <li key={item.id} className="flex items-center gap-1">
          {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />}
          <Badge variant="outline" className="font-normal">
            {item.label}
            <span className="ml-1 text-muted-foreground">{item.typeLabel}</span>
          </Badge>
        </li>
      ))}
    </ol>
  );
}

/**
 * What the preview read to get its answer, disclosed on demand: every value
 * and the revision it was read at, and the items the reads passed through.
 */
export function PreviewDetails({
  dependencies,
  traversed,
}: {
  dependencies: readonly PreviewDependency[];
  traversed: readonly PreviewItem[];
}) {
  const items = new Set(dependencies.map((dependency) => dependency.itemLabel)).size;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex min-h-9 items-center gap-1 text-xs text-muted-foreground">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
        Read {dependencies.length} values across {items} {items === 1 ? 'item' : 'items'}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pl-5">
        <TraversedItems items={traversed} />
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Item</th>
              <th className="py-1 font-medium">Field</th>
              <th className="py-1 text-right font-medium">Revision</th>
            </tr>
          </thead>
          <tbody>
            {dependencies.map((dependency) => (
              <tr
                key={`${dependency.itemLabel}-${dependency.fieldLabel}-${dependency.revision}`}
                className="border-t"
              >
                <td className="py-1">{dependency.itemLabel}</td>
                <td className="py-1">{dependency.fieldLabel}</td>
                <td className="py-1 text-right font-mono">{dependency.revision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CollapsibleContent>
    </Collapsible>
  );
}
