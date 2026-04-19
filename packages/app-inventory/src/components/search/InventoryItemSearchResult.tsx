import { Package } from 'lucide-react';

import { formatAUD, highlightMatch } from '@pops/ui';

/**
 * InventoryItemSearchResult — ResultComponent for inventory-items search hits.
 *
 * Renders item name (highlighted), location, and formatted value.
 * Registered for domain "inventory-items" in the search result component registry.
 */
import type { ResultComponentProps } from '@pops/navigation';

interface InventoryItemHitData {
  itemName: string;
  location: string | null;
  room: string | null;
  replacementValue: number | null;
  brand: string | null;
}

export function InventoryItemSearchResult({ data }: ResultComponentProps) {
  const hit = data as unknown as InventoryItemHitData & {
    _query?: string;
    _matchType?: string;
  };
  const { itemName, location, room, replacementValue, brand } = hit;
  const query = hit._query ?? '';
  const matchType = hit._matchType ?? 'contains';

  const locationText = [room, location].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center gap-3 py-1" data-testid="inventory-item-search-result">
      {/* Icon */}
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <Package className="h-5 w-5 opacity-50" />
      </div>

      {/* Text content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-tight">
          {highlightMatch(itemName, query, matchType)}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {brand && <span>{brand}</span>}
          {brand && locationText && <span>·</span>}
          {locationText && <span>{locationText}</span>}
        </div>
      </div>

      {/* Value */}
      {replacementValue != null && (
        <span className="shrink-0 text-xs font-medium text-muted-foreground" data-testid="value">
          {formatAUD(replacementValue)}
        </span>
      )}
    </div>
  );
}
