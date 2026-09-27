import { Receipt, ShoppingBag } from 'lucide-react';

import { formatCents, highlightMatch } from '@pops/ui';

import { RowFrame } from './result-rows';
import { purchaseDateText } from './search-records';

import type { ReactElement } from 'react';

import type { PurchaseHit } from '../../inventory-web/purchase-model';

/** Props for a purchases search result row. */
export interface PurchaseResultRowProps {
  id?: string;
  hit: PurchaseHit;
  query: string;
  active: boolean;
  onActivate?: (id: string) => void;
}

/** Renders one purchase search result with its matched line and UTC date. */
export function PurchaseResultRow({
  id,
  hit,
  query,
  active,
  onActivate,
}: PurchaseResultRowProps): ReactElement {
  const trimmedQuery = query.trim();
  const label = [hit.merchant, hit.orderNumber]
    .filter((part): part is string => part !== null && part !== '')
    .join(' ');
  const detail = [hit.merchant, purchaseDateText(hit.date), hit.orderNumber]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
  const matchedLine = hit.matchedLine;
  const hasMatchedLine = matchedLine !== null;

  return (
    <RowFrame
      id={id}
      active={active}
      label={label}
      onActivate={() => onActivate?.(hit.id)}
      leading={
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {hasMatchedLine ? (
            <ShoppingBag className="size-4" aria-hidden />
          ) : (
            <Receipt className="size-4" aria-hidden />
          )}
        </span>
      }
      trailing={
        <span className="text-sm tabular-nums">{formatCents(hit.totalCents, hit.currency)}</span>
      }
    >
      <p className="truncate text-sm font-medium">
        {hasMatchedLine ? highlightMatch(matchedLine, trimmedQuery) : hit.merchant}
      </p>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </RowFrame>
  );
}
