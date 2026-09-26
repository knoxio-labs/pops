/**
 * The preview of a purchase: a read-only summary with a link into the
 * Purchases pillar (owner decision 4). A line that became a tracked item
 * names it, so the two pillars read as one record.
 */
import { ExternalLink, ShoppingBag } from 'lucide-react';

import { Button, formatCents } from '@pops/ui';

import { INVENTORY_ICONS as I } from '../foundation';
import { PreviewFrame, PreviewList } from './preview-parts';

import type { PlacementWorld } from '../foundation';
import type { PurchaseResult } from './purchase-model';

const day = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Read-only preview of a purchase. */
export function PurchasePreview({
  purchase,
  world,
}: {
  purchase: PurchaseResult;
  world: PlacementWorld;
}) {
  return (
    <PreviewFrame
      mark={
        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ShoppingBag className="size-5" aria-hidden />
        </span>
      }
      title={`${purchase.merchant} ${purchase.orderNumber}`}
      where={
        <span className="text-xs text-muted-foreground">
          {`${day.format(new Date(purchase.date))} · ${formatCents(purchase.totalCents, 'AUD')} · Read only here`}
        </span>
      }
      actions={
        <Button
          size="sm"
          variant="outline"
          suffix={<ExternalLink className="size-3.5" aria-hidden />}
        >
          Open in Purchases
        </Button>
      }
    >
      <PreviewList title="Lines" count={purchase.lines.length} empty="">
        {purchase.lines.map((line) => {
          const tracked = line.itemId === undefined ? undefined : world.items.get(line.itemId);
          return (
            <li key={line.name} className="flex min-h-10 items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {line.quantity > 1 ? `${String(line.quantity)} × ` : ''}
                  {line.name}
                </span>
                {tracked ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <I.item className="size-3.5" aria-hidden />
                    Tracked as {tracked.name}
                  </span>
                ) : null}
              </span>
              <span className="w-20 shrink-0 text-right tabular-nums">
                {formatCents(line.priceCents * line.quantity, 'AUD')}
              </span>
            </li>
          );
        })}
      </PreviewList>
    </PreviewFrame>
  );
}
