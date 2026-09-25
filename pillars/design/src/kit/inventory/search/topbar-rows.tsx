/**
 * The TopBar dropdown's rows: a result (item or place), a purchase, and
 * the recents shown before anything is typed. The first row is the one
 * Enter opens.
 */
import { MapPin, Search, ShoppingBag } from 'lucide-react';

import { cn, formatCents, highlightMatch } from '@pops/ui';

import { CodeBadge, ItemMark, PlacementPath } from '../foundation';
import { parentPath } from './results-list';

import type { ReactNode } from 'react';

import type { PaletteCommand, PlacementWorld } from '../foundation';
import type { PurchaseResult } from './purchase-model';
import type { TypeaheadRow } from './search-model';

function Row({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      role="option"
      aria-selected={active}
      className={cn(
        'flex h-11 items-center gap-3 rounded-md px-2.5',
        active ? 'bg-muted' : 'hover:bg-muted/60'
      )}
    >
      {children}
    </div>
  );
}

/** One item or place row. */
export function ResultRow({
  row,
  query,
  world,
  active,
}: {
  row: TypeaheadRow;
  query: string;
  world: PlacementWorld;
  active: boolean;
}) {
  if (row.kind === 'place') {
    return (
      <Row active={active}>
        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">
          {highlightMatch(row.place.name, query, row.tier)}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {parentPath(world, row.place.id) || 'Top level'}
        </span>
      </Row>
    );
  }
  const { item } = row.hit;
  return (
    <Row active={active}>
      <ItemMark item={item} />
      <span className="min-w-0 flex-1 truncate text-sm">
        {row.hit.field === null ? highlightMatch(item.name, query, row.hit.tier) : item.name}
      </span>
      {row.exact ? (
        <span className="text-2xs font-semibold tracking-label text-app-accent uppercase">
          Exact code
        </span>
      ) : null}
      <PlacementPath
        world={world}
        placement={item.placement}
        maxSegments={2}
        className="max-w-48 text-xs"
      />
      <CodeBadge code={item.code} />
    </Row>
  );
}

/** One purchase row. */
export function PurchaseRow({ purchase, active }: { purchase: PurchaseResult; active: boolean }) {
  return (
    <Row active={active}>
      <ShoppingBag className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">{`${purchase.merchant} ${purchase.orderNumber}`}</span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatCents(purchase.totalCents, 'AUD')}
      </span>
    </Row>
  );
}

/** Recent queries and records. */
export function Recents({
  queries,
  records,
}: {
  queries: readonly string[];
  records: readonly PaletteCommand[];
}) {
  return (
    <>
      <p className="px-2.5 pt-1 pb-1.5 text-2xs font-semibold tracking-label text-muted-foreground uppercase">
        Recent searches
      </p>
      {queries.slice(0, 3).map((query, index) => (
        <Row key={query} active={index === 0}>
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-sm">{query}</span>
        </Row>
      ))}
      <p className="px-2.5 pt-2 pb-1.5 text-2xs font-semibold tracking-label text-muted-foreground uppercase">
        Recently opened
      </p>
      {records.map((record) => (
        <Row key={record.id} active={false}>
          <record.icon className="size-4 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm">{record.label}</span>
          <span className="truncate text-xs text-muted-foreground">{record.detail}</span>
        </Row>
      ))}
    </>
  );
}
