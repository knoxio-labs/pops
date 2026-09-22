import { Badge } from '@pops/ui';

import type { CatalogueCompatibility } from './types';

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

/** Reports the producer-owned draft validation and affected-item preview. */
export function CompatibilityPreview({
  compatibility,
}: {
  readonly compatibility: CatalogueCompatibility;
}) {
  return (
    <section aria-label="Dry-run validation" className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Dry-run validation</h3>
          <p className="text-xs text-muted-foreground">
            Inventory validated the complete persisted draft.
          </p>
        </div>
        <Badge variant="outline">Passed</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Affected items" value={String(compatibility.affectedItems)} />
        <Metric label="Affected definitions" value={String(compatibility.affectedIds.length)} />
      </div>
      {compatibility.changes.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {compatibility.changes.map((change) => (
            <li key={`${change.definitionId}-${change.code}`}>
              <span className="font-mono">{change.code}</span> · {change.definitionId}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
