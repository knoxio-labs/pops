import { ExternalLink } from 'lucide-react';

import { purchaseDateText } from '../../foundation/search/search-records.js';
import { purchaseHref } from '../../inventory-web/purchase-model.js';
import { useItemPurchase } from '../../inventory-web/useItemPurchase.js';
import { useWebItemDetail } from '../../inventory-web/useWebItemDetail.js';
import { PreviewFact } from './preview-parts.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';

function dayText(value: string): string {
  return Number.isNaN(Date.parse(value)) ? value : purchaseDateText(value);
}

function provenanceText(
  provenance: { merchant: string | null; purchasedOn: string | null } | null | undefined
): string | null {
  if (provenance === null || provenance === undefined) return null;
  const parts = [
    provenance.merchant ?? '',
    provenance.purchasedOn === null ? '' : dayText(provenance.purchasedOn),
  ].filter((part) => part !== '');
  return parts.length === 0 ? null : parts.join(', ');
}

/** Renders the item facts and resolves purchase provenance for the search preview. */
export function ItemFacts({ item }: { item: ItemRowModel }): ReactElement {
  const detail = useWebItemDetail(item.id, 1);
  const itemPurchase = useItemPurchase(item.id);
  const provenance = detail.status === 'success' ? detail.data?.item.provenance : null;
  const bought = provenanceText(provenance);
  const purchase = itemPurchase.status === 'success' ? itemPurchase.purchase : null;

  return (
    <dl className="divide-y divide-border/60 rounded-lg border">
      <PreviewFact label="Type">{item.typeName ?? 'None yet'}</PreviewFact>
      <PreviewFact label="Quantity">{item.quantity}</PreviewFact>
      <PreviewFact label="Code">{item.code ?? 'None'}</PreviewFact>
      <PreviewFact label="Bought">
        {purchase !== null ? (
          <span className="flex items-center gap-2">
            <span>{`${purchase.merchant}, ${purchaseDateText(purchase.orderedAt)}`}</span>
            <a
              href={purchaseHref(purchase.id)}
              aria-label="Opens in Purchases"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </span>
        ) : (
          (bought ?? <span className="text-muted-foreground">No linked purchase</span>)
        )}
      </PreviewFact>
      <PreviewFact label="Changed">{dayText(item.updatedAt)}</PreviewFact>
      {item.note ? <PreviewFact label="Note">{item.note}</PreviewFact> : null}
    </dl>
  );
}
