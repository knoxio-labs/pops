/**
 * The three lists of a place's contents, each a grid of the shared rows:
 * what sits directly here, what is inside the boxes here (box by box), and
 * the places inside. Each takes the keyboard through the shared selection
 * model when it is given one.
 */
import { ItemList } from '../foundation';
import { tallyPlace } from '../locations-tree/tree-model';
import { BoxHeader, ContentsItemRow } from './contents-rows';
import { PlaceRow } from './place-row';

import type { ItemRowModel, LocationModel } from '../foundation';
import type { BoxGroup } from './contents-model';
import type { RowContext } from './contents-rows';

function keys(ctx: RowContext) {
  const selection = ctx.selection;
  if (selection === undefined) return undefined;
  return (event: {
    key: string;
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    preventDefault: () => void;
  }) => {
    if (selection.onKey(event)) event.preventDefault();
  };
}

/** Things sitting directly in the place, boxes first. */
export function HereList({ items, ctx }: { items: readonly ItemRowModel[]; ctx: RowContext }) {
  return (
    <ItemList label="Directly here" onKeyDown={keys(ctx)}>
      {items.map((entry) => (
        <ContentsItemRow key={entry.id} item={entry} ctx={ctx} />
      ))}
    </ItemList>
  );
}

/** What is inside each box here, under the box it is in. */
export function BoxedList({ groups, ctx }: { groups: readonly BoxGroup[]; ctx: RowContext }) {
  return (
    <ItemList label="In boxes here" onKeyDown={keys(ctx)}>
      {groups.map((group) => (
        <div key={group.box.id} role="rowgroup" aria-label={group.box.name}>
          <BoxHeader box={group.box} count={group.contents.length} depth={group.depth} ctx={ctx} />
          <div className={group.depth > 0 ? 'pl-12' : 'pl-6'}>
            {group.contents.map((entry) => (
              <ContentsItemRow key={entry.id} item={entry} ctx={ctx} inBox />
            ))}
          </div>
        </div>
      ))}
    </ItemList>
  );
}

function placeDetail(ctx: RowContext, node: LocationModel): string {
  const tally = tallyPlace(ctx.world, node.id);
  const parts: string[] = [];
  if (tally.places > 0) parts.push(tally.places === 1 ? '1 place' : `${tally.places} places`);
  if (tally.total > 0) parts.push(tally.total === 1 ? '1 thing' : `${tally.total} things`);
  return parts.length === 0 ? 'Empty' : parts.join(', ');
}

/** Places inside this one. */
export function PlacesList({
  places,
  ctx,
  onOpenPlace,
}: {
  places: readonly LocationModel[];
  ctx: RowContext;
  onOpenPlace: (id: string) => void;
}) {
  return (
    <ItemList label="Places inside">
      {places.map((node) => (
        <PlaceRow
          key={node.id}
          ctx={ctx}
          node={node}
          detail={placeDetail(ctx, node)}
          onOpen={() => onOpenPlace(node.id)}
        />
      ))}
    </ItemList>
  );
}
