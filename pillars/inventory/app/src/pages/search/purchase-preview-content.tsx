import { ExternalLink, ShoppingBag } from 'lucide-react';

import { Button, formatCents, Skeleton } from '@pops/ui';

import { INVENTORY_ICONS as I } from '../../foundation/model/icons.js';
import { PreviewFrame, PreviewList } from './preview-parts.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PurchaseResult } from '../../inventory-web/purchase-model.js';

const longDay = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function purchaseDayText(value: string): string {
  return Number.isNaN(Date.parse(value)) ? value : longDay.format(new Date(value));
}

function titleText(purchase: PurchaseResult): string {
  return [purchase.merchant, purchase.orderNumber].filter((part) => part !== '').join(' ');
}

function purchaseMark(): ReactElement {
  return (
    <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <ShoppingBag className="size-5" aria-hidden />
    </span>
  );
}

function purchaseActions(onOpenInPurchases: () => void): ReactElement {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      suffix={<ExternalLink className="size-3.5" aria-hidden />}
      onClick={onOpenInPurchases}
    >
      Open in Purchases
    </Button>
  );
}

/** Renders the lines and tracked-item names for a read-only purchase summary. */
export function PurchaseSummary({
  purchase,
  currency,
  items,
  onOpenInPurchases,
}: {
  purchase: PurchaseResult;
  currency: string;
  items: ReadonlyMap<string, ItemRowModel>;
  onOpenInPurchases: () => void;
}): ReactElement {
  return (
    <PreviewFrame
      mark={purchaseMark()}
      title={titleText(purchase)}
      where={
        <span className="text-xs text-muted-foreground">
          {`${purchaseDayText(purchase.date)} · ${formatCents(purchase.totalCents, currency)} · Read only here`}
        </span>
      }
      actions={purchaseActions(onOpenInPurchases)}
    >
      <PreviewList title="Lines" count={purchase.lines.length} empty="">
        {purchase.lines.map((line, index) => {
          const tracked = line.itemId === undefined ? undefined : items.get(line.itemId);
          return (
            <li
              key={`${line.name}-${String(index)}`}
              className="flex min-h-10 items-center gap-3 px-3 py-2 text-sm"
            >
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
                {formatCents(line.priceCents * line.quantity, currency)}
              </span>
            </li>
          );
        })}
      </PreviewList>
    </PreviewFrame>
  );
}

/** Renders the loading or failed state for a read-only purchase preview. */
export function PurchaseStatePreview({
  error,
  onOpenInPurchases,
}: {
  error: boolean;
  onOpenInPurchases: () => void;
}): ReactElement {
  return (
    <PreviewFrame
      mark={purchaseMark()}
      title="Purchase"
      badges={error ? undefined : <Skeleton className="h-6 w-48" />}
      where={<span className="text-xs text-muted-foreground">Read only here</span>}
      actions={purchaseActions(onOpenInPurchases)}
    >
      <PreviewList title="Lines" count={0} empty="">
        {error ? (
          <li className="flex min-h-10 items-center px-3 py-2 text-sm">
            This purchase did not load.
          </li>
        ) : (
          Array.from({ length: 3 }, (_, index) => (
            <li key={`skeleton-${String(index)}`} className="h-10">
              <Skeleton className="h-10 w-full rounded-none" />
            </li>
          ))
        )}
      </PreviewList>
    </PreviewFrame>
  );
}
