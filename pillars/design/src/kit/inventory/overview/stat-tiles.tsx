/**
 * The Browse tiles (iOS #1): Items, Containers, Locations, each a count and
 * one line that says what the count leaves out, each opening its page.
 */
import { ChevronRight } from 'lucide-react';

import { ButtonPrimitive } from '@pops/ui';

import { INVENTORY_ICONS } from '../shared/icons';

import type { InventoryConcept } from '../shared/icons';
import type { OverviewCounts } from './overview-model';

interface Tile {
  concept: InventoryConcept;
  label: string;
  count: number;
  detail: string;
  path: string;
}

function tiles(counts: OverviewCounts): Tile[] {
  return [
    {
      concept: 'item',
      label: 'Items',
      count: counts.items,
      detail: `${counts.things} counting quantities`,
      path: '/inventory/items',
    },
    {
      concept: 'container',
      label: 'Containers',
      count: counts.containers,
      detail: `${counts.openContainers} open`,
      path: '/inventory/containers',
    },
    {
      concept: 'location',
      label: 'Locations',
      count: counts.locations,
      detail: 'Places things are kept',
      path: '/inventory/locations',
    },
  ];
}

/** The tile row. */
export function StatTiles({
  counts,
  onNavigate,
}: {
  counts: OverviewCounts;
  onNavigate?: (path: string) => void;
}) {
  return (
    <div className="grid shrink-0 grid-cols-3 gap-3">
      {tiles(counts).map((tile) => {
        const Icon = INVENTORY_ICONS[tile.concept];
        return (
          <ButtonPrimitive
            key={tile.label}
            variant="outline"
            aria-label={`${tile.label}: ${tile.count}. Open ${tile.label}`}
            onClick={() => onNavigate?.(tile.path)}
            className="group h-auto justify-start gap-3 rounded-xl bg-card px-4 py-3 text-left"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-4.5 text-muted-foreground" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums">{tile.count}</span>
                <span className="text-sm font-medium">{tile.label}</span>
              </span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {tile.detail}
              </span>
            </span>
            <ChevronRight
              className="size-4 text-muted-foreground/60 group-hover:text-foreground"
              aria-hidden
            />
          </ButtonPrimitive>
        );
      })}
    </div>
  );
}
