/**
 * The rows the search list draws: an item or container (selectable, with
 * the matched part of its name marked, or the field that matched when the
 * name did not), a place, and a purchase. The active row is the one the
 * preview pane shows and Enter opens.
 */
import { MapPin, ShoppingBag } from 'lucide-react';

import { ButtonPrimitive, Checkbox, cn, formatCents, highlightMatch } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  ItemMark,
  LifecycleBadge,
  PlacementPath,
  QuantityBadge,
} from '../foundation';

import type { ReactNode } from 'react';

import type { PlacementWorld } from '../foundation';
import type { PurchaseResult } from './purchase-model';
import type { ItemHit, MatchField, PlaceHit } from './search-model';

const FIELD_WORDS: Readonly<Record<MatchField, string>> = {
  code: 'Code',
  note: 'Note',
  type: 'Type',
  place: 'Place',
};

function RowFrame({
  active,
  selected = false,
  label,
  leading,
  children,
  trailing,
}: {
  active: boolean;
  selected?: boolean;
  label: string;
  leading?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={active}
      aria-label={label}
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

/** One item or container hit. */
export function ItemResultRow({
  hit,
  query,
  world,
  active,
  selected,
  onToggle,
}: {
  hit: ItemHit;
  query: string;
  world: PlacementWorld;
  active: boolean;
  selected: boolean;
  onToggle?: (id: string, shiftKey: boolean) => void;
}) {
  const { item } = hit;
  return (
    <RowFrame
      active={active}
      selected={selected}
      label={item.name}
      leading={
        <>
          <Checkbox
            checked={selected}
            aria-label={`Select ${item.name}`}
            onClick={(event) => {
              event.preventDefault();
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

/** One place hit. */
export function PlaceResultRow({
  hit,
  query,
  path,
  holds,
  active,
}: {
  hit: PlaceHit;
  query: string;
  path: string;
  holds: number;
  active: boolean;
}) {
  return (
    <RowFrame
      active={active}
      label={hit.place.name}
      leading={
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <MapPin className="size-4" aria-hidden />
        </span>
      }
      trailing={<span className="text-xs tabular-nums text-muted-foreground">{holds} here</span>}
    >
      <p className="truncate text-sm font-medium">
        {highlightMatch(hit.place.name, query.trim(), hit.tier)}
      </p>
      <p className="truncate text-xs text-muted-foreground">{path === '' ? 'Top level' : path}</p>
    </RowFrame>
  );
}

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

/** A section heading in the results list. */
export function ResultHeading({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="sticky top-0 z-10 flex h-8 items-center justify-between border-b bg-card px-3 text-2xs font-semibold tracking-label text-muted-foreground uppercase">
      {title}
      <span className="tabular-nums">{count}</span>
    </h3>
  );
}

/** "Show all N" under a capped section. */
export function ShowAll({ count, noun }: { count: number; noun: string }) {
  return (
    <ButtonPrimitive variant="ghost" size="xs" className="mx-3 my-1 text-xs text-muted-foreground">
      Show all {count} {noun}
    </ButtonPrimitive>
  );
}
