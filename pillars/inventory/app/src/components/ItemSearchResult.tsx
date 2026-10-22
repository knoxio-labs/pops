import { useQuery } from '@tanstack/react-query';

import { AssetIdBadge, Button, TypeBadge } from '@pops/ui';

import { unwrap } from '../inventory-api-helpers.js';
import { itemsList } from '../inventory-api/index.js';

import type { LucideIcon } from 'lucide-react';

import type { ItemsListResponse } from '../inventory-api/index.js';

/** One item as the search pickers list it. */
export type SearchableItem = ItemsListResponse['data'][number];

/** Searches items by name or asset id once the dialog is open and the query has two characters. */
export function useItemSearch(open: boolean, search: string, excludeItemId: string) {
  const listInput = { search, limit: 10 };
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'items', 'list', listInput],
    queryFn: async () => unwrap(await itemsList({ query: listInput })),
    enabled: open && search.length >= 2,
  });
  const results = data?.data.filter((item: SearchableItem) => item.id !== excludeItemId) ?? [];
  return { isLoading, results };
}

interface ItemSearchResultRowProps {
  item: SearchableItem;
  icon: LucideIcon;
  disabled: boolean;
  onPick: (itemId: string) => void;
}

/** A pickable search result: name, brand and model, asset id and type. */
export function ItemSearchResultRow({
  item,
  icon: Icon,
  disabled,
  onPick,
}: ItemSearchResultRowProps) {
  const hasMeta = ((item.brand ?? item.model) || item.assetId) ?? item.type;
  return (
    <Button
      variant="ghost"
      className="w-full flex items-center justify-between p-2.5 h-auto text-left"
      onClick={() => onPick(item.id)}
      disabled={disabled}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{item.itemName}</div>
        {hasMeta ? (
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {(item.brand ?? item.model) && (
              <span className="text-xs text-muted-foreground">
                {[item.brand, item.model].filter(Boolean).join(' · ')}
              </span>
            )}
            {item.assetId && <AssetIdBadge assetId={item.assetId} />}
            {item.type && <TypeBadge type={item.type} />}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground mt-0.5">No details</span>
        )}
      </div>
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
    </Button>
  );
}
