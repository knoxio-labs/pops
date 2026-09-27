import { ItemList } from '../rows/item-row.js';
import { BoxHeader, ContentsItemRow, type RowContext } from './contents-rows.js';
import { PlaceRow } from './place-row.js';

export type { RowContext } from './contents-rows.js';

import type { KeyboardEvent, ReactElement } from 'react';

import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { ItemRowModel, LocationModel } from '../model/model.js';
import type { BoxGroup } from './contents-model.js';

function keyHandler(ctx: RowContext) {
  const selection = ctx.selection;
  if (selection === undefined) return undefined;
  return (event: KeyboardEvent<HTMLDivElement>): void => {
    if (selection.onKey(event)) event.preventDefault();
  };
}

/** Renders direct rows in boxes-first order. */
export function HereList({
  items,
  ctx,
}: {
  items: readonly ItemRowModel[];
  ctx: RowContext;
}): ReactElement {
  return (
    <ItemList label="Directly here" onKeyDown={keyHandler(ctx)}>
      {items.map((item) => (
        <ContentsItemRow key={item.id} item={item} ctx={ctx} />
      ))}
    </ItemList>
  );
}

/** Renders each box and its contents, indenting nested box groups. */
export function BoxedList({
  groups,
  ctx,
}: {
  groups: readonly BoxGroup[];
  ctx: RowContext;
}): ReactElement {
  return (
    <ItemList label="In boxes here" onKeyDown={keyHandler(ctx)}>
      {groups.map((group) => (
        <div key={`${group.box.id}-${group.depth}`} role="rowgroup" aria-label={group.box.name}>
          <BoxHeader box={group.box} count={group.contents.length} depth={group.depth} ctx={ctx} />
          <div className={group.depth > 0 ? 'pl-12' : 'pl-6'}>
            {group.contents.map((item) => (
              <ContentsItemRow key={item.id} item={item} ctx={ctx} inBox />
            ))}
          </div>
        </div>
      ))}
    </ItemList>
  );
}

function placeDetail(tally: PlaceTally): string {
  const parts: string[] = [];
  if (tally.places > 0) parts.push(`${tally.places} ${tally.places === 1 ? 'place' : 'places'}`);
  if (tally.total > 0) parts.push(`${tally.total} ${tally.total === 1 ? 'thing' : 'things'}`);
  return parts.join(', ') || 'Empty';
}

/** Renders child places with server-provided detail counts. */
export function PlacesList({
  places,
  ctx,
  tallyOf,
  onOpenPlace,
}: {
  places: readonly LocationModel[];
  ctx: RowContext;
  tallyOf: (id: string) => PlaceTally;
  onOpenPlace: (id: string) => void;
}): ReactElement {
  return (
    <div role="grid" aria-label="Places inside">
      {places.map((place) => (
        <PlaceRow
          key={place.id}
          ctx={ctx}
          node={place}
          detail={placeDetail(tallyOf(place.id))}
          onOpen={() => onOpenPlace(place.id)}
        />
      ))}
    </div>
  );
}
