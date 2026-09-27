import { MapPin, Search, ShoppingBag } from 'lucide-react';

import { cn, formatCents, highlightMatch } from '@pops/ui';

import { CodeBadge } from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PlacementPath } from '../../foundation/badges/placement-path.js';
import { locationPath } from '../../foundation/model/placement-model.js';

import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from 'react';

import type { PaletteCommand } from '@pops/ui';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PurchaseHit } from '../../inventory-web/purchase-model.js';
import type { SearchItemHit, SearchPlaceHit } from '../../inventory-web/useWebSearch.js';

/** One server-ranked inventory item or place shown in the TopBar typeahead. */
export type TypeaheadRow =
  | { readonly kind: 'item'; readonly hit: SearchItemHit; readonly exact: boolean }
  | SearchPlaceHit;

interface RowProps {
  readonly id: string;
  readonly active: boolean;
  readonly onActivate: () => void;
  readonly children: ReactNode;
}

function Row({ id, active, onActivate, children }: RowProps): ReactElement {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      className={cn(
        'flex h-11 items-center gap-3 rounded-md px-2.5',
        active ? 'bg-muted' : 'hover:bg-muted/60'
      )}
      onClick={onActivate}
    >
      {children}
    </div>
  );
}

/** Renders one inventory item or place result in the TopBar typeahead. */
export function ResultRow({
  id,
  row,
  query,
  world,
  active,
  onActivate,
}: {
  readonly id: string;
  readonly row: TypeaheadRow;
  readonly query: string;
  readonly world: PlacementWorld;
  readonly active: boolean;
  readonly onActivate: () => void;
}): ReactElement {
  if (row.kind === 'place') {
    return (
      <Row id={id} active={active} onActivate={onActivate}>
        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">
          {highlightMatch(row.place.name, query, row.tier)}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {locationPath(world, row.place.id)
            .slice(0, -1)
            .map((location) => location.name)
            .join(' › ') || 'Top level'}
        </span>
      </Row>
    );
  }

  const { item } = row.hit;
  return (
    <Row id={id} active={active} onActivate={onActivate}>
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

/** Renders one purchases result in the TopBar typeahead. */
export function PurchaseRow({
  id,
  hit,
  active,
  onActivate,
}: {
  readonly id: string;
  readonly hit: PurchaseHit;
  readonly active: boolean;
  readonly onActivate: () => void;
}): ReactElement {
  return (
    <Row id={id} active={active} onActivate={onActivate}>
      <ShoppingBag className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">
        {[hit.merchant, hit.orderNumber ?? hit.matchedLine]
          .filter((part): part is string => part !== null && part.trim() !== '')
          .join(' ')}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatCents(hit.totalCents, hit.currency)}
      </span>
    </Row>
  );
}

/** Renders recent queries and recently opened inventory records. */
export function Recents({
  queries,
  records,
  activeIndex,
  optionId,
  onQuery,
  onRecord,
}: {
  readonly queries: readonly string[];
  readonly records: readonly PaletteCommand[];
  readonly activeIndex: number;
  readonly optionId: (index: number) => string;
  readonly onQuery: (query: string) => void;
  readonly onRecord: (entry: PaletteCommand) => void;
}): ReactElement {
  const recentQueries = queries.slice(0, 3);
  return (
    <>
      <p className="px-2.5 pt-1 pb-1.5 text-2xs font-semibold tracking-label text-muted-foreground uppercase">
        Recent searches
      </p>
      {recentQueries.map((query, index) => (
        <Row
          key={query}
          id={optionId(index)}
          active={activeIndex === index}
          onActivate={() => onQuery(query)}
        >
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-sm">{query}</span>
        </Row>
      ))}
      <p className="px-2.5 pt-2 pb-1.5 text-2xs font-semibold tracking-label text-muted-foreground uppercase">
        Recently opened
      </p>
      {records.map((record, index) => {
        const flatIndex = recentQueries.length + index;
        const Icon = record.icon;
        return (
          <Row
            key={record.id}
            id={optionId(flatIndex)}
            active={activeIndex === flatIndex}
            onActivate={() => onRecord(record)}
          >
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">{record.label}</span>
            <span className="truncate text-xs text-muted-foreground">{record.detail}</span>
          </Row>
        );
      })}
    </>
  );
}

/** Parses the prefixed record identifiers used by TopBar recents. */
export function parseTopbarRecord(
  entryId: string
): { kind: 'item' | 'place'; id: string; href: string } | null {
  const [kind, id] = entryId.split(':');
  if (id === undefined || id === '' || (kind !== 'item' && kind !== 'place')) return null;
  return {
    kind,
    id,
    href:
      kind === 'item'
        ? `/inventory/items/${encodeURIComponent(id)}`
        : `/inventory/locations/${encodeURIComponent(id)}`,
  };
}

/** Returns whether a key is an unmodified forward Tab. */
export function isPlainTopbarTab(event: ReactKeyboardEvent<HTMLInputElement>): boolean {
  return (
    event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
  );
}

/** Moves a TopBar option one step, clamped to the available rows. */
export function moveTopbarActive(
  event: ReactKeyboardEvent<HTMLInputElement>,
  count: number,
  activeIndex: number,
  setActive: (index: number) => void
): boolean {
  if (count === 0 || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return false;
  const next = activeIndex < 0 ? 0 : activeIndex + (event.key === 'ArrowDown' ? 1 : -1);
  setActive(Math.min(count - 1, Math.max(0, next)));
  return true;
}
