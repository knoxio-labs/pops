import { ArrowUpRight, ShoppingBag } from 'lucide-react';

import { Button, formatCents, formatDate } from '@pops/ui';

import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PreviewActions, PreviewFact, PreviewFrame, PreviewList } from './preview-parts.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PurchaseResult } from '../../inventory-web/purchase-model.js';

/** Props for a read-only purchase preview. */
export interface PurchasePreviewProps {
  readonly purchase: PurchaseResult;
  readonly world: PlacementWorld;
  readonly onOpen: () => void;
}

/** Renders purchase facts and the line items linked to inventory records. */
export function PurchasePreview({ purchase, world, onOpen }: PurchasePreviewProps) {
  return (
    <PreviewFrame
      title={
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ShoppingBag className="size-5" aria-hidden />
          </span>
          <span className="truncate">{purchase.merchant}</span>
        </span>
      }
      subtitle={purchase.orderNumber === '' ? 'Purchase' : `Order ${purchase.orderNumber}`}
    >
      <PreviewActions>
        <Button size="sm" onClick={onOpen} prefix={<ArrowUpRight className="size-4" aria-hidden />}>
          Open purchase
        </Button>
      </PreviewActions>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
        <PreviewFact label="Date" value={formatDate(purchase.date)} />
        <PreviewFact label="Total" value={formatCents(purchase.totalCents, 'AUD')} />
        <PreviewFact label="Lines" value={String(purchase.lines.length)} />
      </dl>
      <PreviewList title="Purchase lines">
        {purchase.lines.map((line, index) => {
          const item = line.itemId === undefined ? undefined : world.items.get(line.itemId);
          return (
            <div
              key={`${line.name}-${String(index)}`}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              {item !== undefined ? (
                <ItemMark item={item} size="sm" />
              ) : (
                <span className="size-7 shrink-0 rounded-md bg-muted" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{line.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {line.quantity} × {formatCents(line.priceCents, 'AUD')}
              </span>
            </div>
          );
        })}
      </PreviewList>
    </PreviewFrame>
  );
}
