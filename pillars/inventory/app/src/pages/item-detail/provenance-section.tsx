import { ExternalLink, Receipt } from 'lucide-react';

import { EmptyLine } from '../../foundation/item-page/section-parts';

import type { ReactElement } from 'react';

import type { DetailProvenance } from './detail-model';

/** Returns whether at least one provenance value is available. */
export function hasProvenance(provenance: DetailProvenance): boolean {
  return (
    provenance.purchasedOn !== null ||
    provenance.pricePaid !== null ||
    provenance.merchant !== null ||
    provenance.warrantyUntil !== null ||
    provenance.purchase !== null
  );
}

/** Creates the one-line Overview summary for provenance. */
export function provenanceSummary(provenance: DetailProvenance): string {
  if (!hasProvenance(provenance)) return 'No purchase details recorded';
  return [
    provenance.pricePaid,
    provenance.merchant && `at ${provenance.merchant}`,
    provenance.purchasedOn,
  ]
    .filter((value): value is string => value !== null && value.length > 0)
    .join(' ');
}

/** Renders purchase, merchant, warranty, and transaction provenance. */
export function ProvenanceSection({ provenance }: { provenance: DetailProvenance }): ReactElement {
  if (!hasProvenance(provenance)) {
    return <EmptyLine icon={Receipt} text="No purchase details recorded." />;
  }
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 @lg:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Bought</dt>
          <dd className="truncate text-sm">{provenance.purchasedOn ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Paid</dt>
          <dd className="truncate text-sm">{provenance.pricePaid ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">From</dt>
          <dd className="truncate text-sm">{provenance.merchant ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Warranty until</dt>
          <dd className="truncate text-sm">{provenance.warrantyUntil ?? 'Not recorded'}</dd>
        </div>
      </dl>
      {provenance.purchase ? (
        <a
          href={provenance.purchase.href}
          className="flex min-h-11 items-center gap-2 rounded-md bg-muted/50 px-2 text-sm text-app-accent hover:underline"
        >
          <Receipt className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{provenance.purchase.label}</span>
          <ExternalLink className="size-4 shrink-0" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}
