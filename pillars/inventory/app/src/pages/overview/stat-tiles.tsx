import { ChevronRight } from 'lucide-react';

import { ButtonPrimitive } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';

import type { ReactElement } from 'react';

import type { WebSummaryGetResponse } from '../../inventory-api/types.gen.js';

interface StatTile {
  label: string;
  count: number;
  detail: string;
  path: string;
  icon: (typeof INVENTORY_ICONS)[keyof typeof INVENTORY_ICONS];
}

function statTiles(counts: WebSummaryGetResponse['counts']): StatTile[] {
  return [
    {
      label: 'Items',
      count: counts.items,
      detail: `${counts.things} counting quantities`,
      path: '/inventory/items',
      icon: INVENTORY_ICONS.item,
    },
    {
      label: 'Containers',
      count: counts.containers,
      detail: `${counts.openContainers} open`,
      path: '/inventory/containers',
      icon: INVENTORY_ICONS.container,
    },
    {
      label: 'Locations',
      count: counts.locations,
      detail: 'Places things are kept',
      path: '/inventory/locations',
      icon: INVENTORY_ICONS.location,
    },
  ];
}

function StatTile({ tile, onNavigate }: { tile: StatTile; onNavigate: (path: string) => void }) {
  const { label, count, detail, path, icon: Icon } = tile;
  return (
    <ButtonPrimitive
      variant="outline"
      aria-label={`${label}: ${count}. Open ${label}`}
      onClick={() => onNavigate(path)}
      className="group h-auto justify-start gap-3 rounded-xl bg-card px-4 py-3 text-left"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums">{count}</span>
          <span className="text-sm font-medium">{label}</span>
        </span>
        <span className="block truncate text-xs font-normal text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight
        className="size-4 text-muted-foreground/60 group-hover:text-foreground"
        aria-hidden
      />
    </ButtonPrimitive>
  );
}

/** Renders the three Overview count tiles and their navigation affordances. */
export function StatTiles({
  counts,
  onNavigate,
}: {
  counts: WebSummaryGetResponse['counts'];
  onNavigate: (path: string) => void;
}): ReactElement {
  return (
    <div className="grid shrink-0 grid-cols-3 gap-3">
      {statTiles(counts).map((tile) => (
        <StatTile key={tile.label} tile={tile} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
