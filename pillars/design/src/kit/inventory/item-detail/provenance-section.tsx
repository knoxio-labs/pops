/**
 * Where the item came from: when, for how much, from whom, the warranty,
 * and the purchase record in Purchases when one is linked. Nothing recorded
 * folds to one line (spec 3.7).
 */
import { ArrowUpRight, Receipt } from 'lucide-react';

import { EmptyLine, ValuePair } from './section-parts';
import { VerbButton } from './verb-button';

import type { DetailProvenance } from './detail-model';

/** Whether anything about provenance is recorded. */
export function hasProvenance(provenance: DetailProvenance): boolean {
  return Object.values(provenance).some((value) => value !== null);
}

/** One line for a folded section header: "$2,299.00 at JB Hi-Fi, 14 Feb 2026". */
export function provenanceSummary(provenance: DetailProvenance): string {
  if (!hasProvenance(provenance)) return 'No purchase details recorded';
  const paid = [provenance.pricePaid, provenance.merchant && `at ${provenance.merchant}`]
    .filter(Boolean)
    .join(' ');
  return [paid, provenance.purchasedOn].filter(Boolean).join(', ');
}

/** The provenance block. */
export function ProvenanceSection({
  provenance,
  readOnly = false,
}: {
  provenance: DetailProvenance;
  readOnly?: boolean;
}) {
  if (!hasProvenance(provenance)) {
    return (
      <EmptyLine
        icon={Receipt}
        text="No purchase details recorded."
        actionLabel={readOnly ? undefined : 'Add'}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 @lg:grid-cols-4">
        <ValuePair label="Bought" value={provenance.purchasedOn} />
        <ValuePair label="Paid" value={provenance.pricePaid} />
        <ValuePair label="From" value={provenance.merchant} />
        <ValuePair label="Warranty until" value={provenance.warrantyUntil} />
      </dl>
      {provenance.purchase ? (
        <div className="flex min-h-11 items-center gap-2 rounded-md bg-muted/50 px-2 text-sm">
          <Receipt className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{provenance.purchase.label}</span>
          <VerbButton label="Open in Purchases" icon={ArrowUpRight} variant="ghost" />
        </div>
      ) : null}
    </div>
  );
}
