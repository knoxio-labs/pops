import { Badge } from '@pops/ui';

import type { CatalogueCompatibility, CatalogueReadiness } from './types';

const classificationLabels: Record<CatalogueCompatibility['classification'], string> = {
  compatible: 'Compatible',
  protocol_gated: 'Protocol gated',
  migration_required: 'Migration required',
  forbidden: 'Forbidden',
};

const blockedClassifications: ReadonlySet<CatalogueCompatibility['classification']> = new Set([
  'migration_required',
  'forbidden',
]);

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

/** Reports the producer-owned draft validation and affected-item preview, or why one is missing. */
export function CompatibilityPreview({ readiness }: { readonly readiness: CatalogueReadiness }) {
  if (readiness.status === 'not_previewed')
    return (
      <section aria-label="Dry-run validation" className="space-y-2 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Dry-run validation</h3>
          <Badge variant="outline">Not yet previewed</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Edit a type or field to run a dry-run preview before publishing.
        </p>
      </section>
    );
  if (readiness.status === 'stale')
    return (
      <section aria-label="Dry-run validation" className="space-y-2 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Dry-run validation</h3>
          <Badge variant="destructive">Stale</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          This preview no longer matches the current draft. Make or repeat an edit to refresh it
          before publishing.
        </p>
      </section>
    );
  const { compatibility } = readiness;
  const badgeVariant = blockedClassifications.has(compatibility.classification)
    ? 'destructive'
    : 'outline';
  return (
    <section aria-label="Dry-run validation" className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Dry-run validation</h3>
          <p className="text-xs text-muted-foreground">
            Inventory validated the complete persisted draft.
          </p>
        </div>
        <Badge variant={badgeVariant}>{classificationLabels[compatibility.classification]}</Badge>
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
