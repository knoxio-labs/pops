import { PackageSearch } from 'lucide-react';

import { formatCents, highlightMatch } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { RowVerb } from '../../foundation/rows/item-row.js';
import { ResultRowFrame, stopRowClick } from './result-row-frame.js';

import type { PurchaseHit } from '../../inventory-web/purchase-model.js';

/** Props for a purchase result row. */
export interface PurchaseResultRowProps {
  readonly hit: PurchaseHit;
  readonly query: string;
  readonly active: boolean;
  readonly onActivate: () => void;
  readonly onOpen: () => void;
}

/** Renders one server-ranked purchase result without inventory selection controls. */
export function PurchaseResultRow({
  hit,
  query,
  active,
  onActivate,
  onOpen,
}: PurchaseResultRowProps) {
  return (
    <ResultRowFrame id={hit.id} kind="purchase" active={active} onActivate={onActivate}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <INVENTORY_ICONS.computed className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">
          {highlightMatch(hit.merchant, query, 'contains')}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span>{hit.orderNumber ?? 'Line item match'}</span>
          <span aria-hidden>·</span>
          <span>{formatCents(hit.totalCents, hit.currency)}</span>
        </span>
        {hit.matchedLine !== null ? (
          <span className="truncate text-2xs text-muted-foreground">Matched {hit.matchedLine}</span>
        ) : null}
      </span>
      <span onClick={stopRowClick}>
        <RowVerb icon={PackageSearch} label="Open purchase" onClick={onOpen} />
      </span>
    </ResultRowFrame>
  );
}
