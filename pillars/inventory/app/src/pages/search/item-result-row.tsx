import { PackageSearch } from 'lucide-react';

import { ButtonPrimitive, Checkbox, highlightMatch } from '@pops/ui';

import { CodeBadge } from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PlacementPath } from '../../foundation/badges/placement-path.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { RowVerb } from '../../foundation/rows/item-row.js';
import { ResultRowFrame, stopRowClick } from './result-row-frame.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SearchItemHit } from '../../inventory-web/useWebSearch.js';

function FieldMatch({ field }: { readonly field: SearchItemHit['field'] }) {
  if (field === null) return null;
  let label = field;
  if (field === 'code') label = 'code';
  if (field === 'note') label = 'note';
  return <span className="text-2xs text-muted-foreground">Matched {label}</span>;
}

/** Props for an item or container result row. */
export interface ItemResultRowProps {
  readonly hit: SearchItemHit;
  readonly query: string;
  readonly world: PlacementWorld;
  readonly active: boolean;
  readonly checked: boolean;
  readonly onActivate: () => void;
  readonly onToggle: (shiftKey: boolean) => void;
  readonly onOpen: () => void;
  readonly onPickUp: () => void;
  readonly onPutBack: () => void;
  readonly onMove: () => void;
}

function ItemResultInfo({
  hit,
  query,
  world,
  onOpen,
}: Pick<ItemResultRowProps, 'hit' | 'query' | 'world' | 'onOpen'>) {
  const { item } = hit;
  const matchType = hit.tier === 'prefix' ? 'prefix' : 'contains';
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-2">
        <ButtonPrimitive
          type="button"
          variant="ghost"
          size="xs"
          className="h-auto min-w-0 justify-start truncate px-0 text-left text-sm font-medium hover:bg-transparent"
          onClick={(event) => {
            stopRowClick(event);
            onOpen();
          }}
        >
          {hit.field === null ? item.name : highlightMatch(item.name, query, matchType)}
        </ButtonPrimitive>
        {item.container !== null ? (
          <span className="inline-flex items-center gap-1 text-2xs text-app-accent">
            <INVENTORY_ICONS.container className="size-3" aria-hidden />
            Container
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <PlacementPath
          world={world}
          placement={item.placement}
          maxSegments={2}
          className="min-w-0"
        />
        <CodeBadge code={item.code} />
        <FieldMatch field={hit.field} />
      </span>
    </span>
  );
}

function ItemResultVerbs({
  hit,
  onOpen,
  onPickUp,
  onPutBack,
  onMove,
}: Pick<ItemResultRowProps, 'hit' | 'onOpen' | 'onPickUp' | 'onPutBack' | 'onMove'>) {
  const inHand = hit.item.placement.kind === 'in-hand';
  return (
    <span className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex sm:flex">
      <span onClick={stopRowClick}>
        <RowVerb icon={PackageSearch} label="Open" onClick={onOpen} />
      </span>
      <span onClick={stopRowClick}>
        <RowVerb
          icon={inHand ? INVENTORY_ICONS.putBack : INVENTORY_ICONS.pickUp}
          label={inHand ? 'Put back' : 'Pick up'}
          onClick={inHand ? onPutBack : onPickUp}
        />
      </span>
      <span onClick={stopRowClick}>
        <RowVerb icon={INVENTORY_ICONS.move} label="Move" onClick={onMove} />
      </span>
    </span>
  );
}

/** Renders a ranked inventory item result with selection and row verbs. */
export function ItemResultRow({
  hit,
  query,
  world,
  active,
  checked,
  onActivate,
  onToggle,
  onOpen,
  onPickUp,
  onPutBack,
  onMove,
}: ItemResultRowProps) {
  const { item } = hit;
  return (
    <ResultRowFrame id={item.id} kind="item" active={active} onActivate={onActivate}>
      <span onClick={stopRowClick} onKeyDown={(event) => event.stopPropagation()}>
        <Checkbox
          checked={checked}
          aria-label={`Select ${item.name}`}
          onClick={(event) => {
            stopRowClick(event);
            onToggle(event.shiftKey);
          }}
        />
      </span>
      <ItemMark item={item} />
      <ItemResultInfo hit={hit} query={query} world={world} onOpen={onOpen} />
      <ItemResultVerbs
        hit={hit}
        onOpen={onOpen}
        onPickUp={onPickUp}
        onPutBack={onPutBack}
        onMove={onMove}
      />
    </ResultRowFrame>
  );
}
