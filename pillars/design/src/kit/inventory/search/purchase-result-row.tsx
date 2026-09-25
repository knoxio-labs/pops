/**
 * One purchase in the Purchases scope: the matching line when a line
 * matched, else the merchant, with date, order number and total.
 */
import { ShoppingBag } from 'lucide-react';

import { formatCents, highlightMatch } from '@pops/ui';

import { RowFrame } from './result-rows';

import type { PurchaseResult } from './purchase-model';

const day = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

/** One purchase hit. */
export function PurchaseResultRow({
  purchase,
  query,
  active,
}: {
  purchase: PurchaseResult;
  query: string;
  active: boolean;
}) {
  const q = query.trim().toLowerCase();
  const line = purchase.lines.find((entry) => entry.name.toLowerCase().includes(q));
  return (
    <RowFrame
      active={active}
      label={`${purchase.merchant} ${purchase.orderNumber}`}
      leading={
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ShoppingBag className="size-4" aria-hidden />
        </span>
      }
      trailing={
        <span className="text-sm tabular-nums">{formatCents(purchase.totalCents, 'AUD')}</span>
      }
    >
      <p className="truncate text-sm font-medium">
        {line ? highlightMatch(line.name, query.trim()) : purchase.merchant}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {`${purchase.merchant} · ${day.format(new Date(purchase.date))} · ${purchase.orderNumber}`}
      </p>
    </RowFrame>
  );
}
