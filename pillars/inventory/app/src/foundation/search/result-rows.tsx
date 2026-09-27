import { MapPin } from 'lucide-react';

import { Checkbox, cn, highlightMatch } from '@pops/ui';

import { CodeBadge, ContainerStateBadge, LifecycleBadge, QuantityBadge } from '../badges/badges';
import { ItemMark } from '../badges/item-mark';
import { PlacementPath } from '../badges/placement-path';

import type { ReactElement, ReactNode } from 'react';

import type { SearchItemHit, SearchPlaceHit } from '../../inventory-web/useWebSearch';
import type { PlacementWorld } from '../model/placement-model';

const FIELD_WORDS: Readonly<Record<NonNullable<SearchItemHit['field']>, string>> = {
  code: 'Code',
  note: 'Note',
  type: 'Type',
  place: 'Place',
};

/** Props for the accessible shell shared by every search result row. */
export interface RowFrameProps {
  id?: string;
  active: boolean;
  selected?: boolean;
  label: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  onActivate?: () => void;
}

/** Renders the active edge, selection tint, accessible label, and row slots. */
export function RowFrame({
  id,
  active,
  selected = false,
  label,
  leading,
  children,
  trailing,
  onActivate,
}: RowFrameProps): ReactElement {
  return (
    <div
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={active}
      aria-label={label}
      onClick={onActivate}
      className={cn(
        'relative flex h-13 items-center gap-3 border-l-2 pr-3 pl-3',
        active ? 'border-l-app-accent bg-muted' : 'border-l-transparent hover:bg-muted/60',
        selected && !active && 'bg-app-accent/10'
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">{children}</div>
      {trailing}
    </div>
  );
}

/** Props for an item or container search result row. */
export interface ItemResultRowProps {
  id?: string;
  hit: SearchItemHit;
  query: string;
  world: PlacementWorld;
  active: boolean;
  selected: boolean;
  onToggle?: (id: string, shiftKey: boolean) => void;
  onActivate?: (id: string) => void;
}

/** Renders one selectable item or container search result. */
export function ItemResultRow({
  id,
  hit,
  query,
  world,
  active,
  selected,
  onToggle,
  onActivate,
}: ItemResultRowProps): ReactElement {
  const { item } = hit;
  return (
    <RowFrame
      id={id}
      active={active}
      selected={selected}
      label={item.name}
      onActivate={() => onActivate?.(item.id)}
      leading={
        <>
          <Checkbox
            checked={selected}
            aria-label={`Select ${item.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggle?.(item.id, event.shiftKey);
            }}
          />
          <ItemMark item={item} />
        </>
      }
      trailing={<CodeBadge code={item.code} />}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <span className="truncate">
          {hit.field === null ? highlightMatch(item.name, query.trim(), hit.tier) : item.name}
        </span>
        <QuantityBadge quantity={item.quantity} />
        <ContainerStateBadge container={item.container} />
        <LifecycleBadge lifecycle={item.lifecycle} />
      </p>
      <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <PlacementPath
          world={world}
          placement={item.placement}
          maxSegments={3}
          className="min-w-0"
        />
        {hit.field !== null && hit.field !== 'place' ? (
          <span className="shrink-0">{FIELD_WORDS[hit.field]} matches</span>
        ) : null}
      </p>
    </RowFrame>
  );
}

/** Props for a place search result row. */
export interface PlaceResultRowProps {
  id?: string;
  hit: SearchPlaceHit;
  query: string;
  path: string;
  holds: number | null;
  active: boolean;
  onActivate?: (id: string) => void;
}

/** Renders one place search result, including its optional direct-item count. */
export function PlaceResultRow({
  id,
  hit,
  query,
  path,
  holds,
  active,
  onActivate,
}: PlaceResultRowProps): ReactElement {
  return (
    <RowFrame
      id={id}
      active={active}
      label={hit.place.name}
      onActivate={() => onActivate?.(hit.place.id)}
      leading={
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <MapPin className="size-4" aria-hidden />
        </span>
      }
      trailing={
        holds === null ? undefined : (
          <span className="text-xs tabular-nums text-muted-foreground">{holds} here</span>
        )
      }
    >
      <p className="truncate text-sm font-medium">
        {highlightMatch(hit.place.name, query.trim(), hit.tier)}
      </p>
      <p className="truncate text-xs text-muted-foreground">{path === '' ? 'Top level' : path}</p>
    </RowFrame>
  );
}

/** Renders a sticky result-section heading with its server-provided count. */
export function ResultHeading({ title, count }: { title: string; count: number }): ReactElement {
  return (
    <h3 className="sticky top-0 z-10 flex h-8 items-center justify-between border-b bg-card px-3 text-2xs font-semibold tracking-label text-muted-foreground uppercase">
      {title}
      <span className="tabular-nums">{count}</span>
    </h3>
  );
}
