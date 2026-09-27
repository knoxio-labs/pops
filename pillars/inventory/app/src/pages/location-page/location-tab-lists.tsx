import { ItemList } from '../../foundation/rows/item-row.js';
import { BoxHeader, ContentRow, ItemContents } from './location-tab-item-row.js';
import { PlaceList } from './location-tab-place-list.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceTab } from './location-page-parts.js';
import type { ContentsVerbs, PlaceContents } from './location-tab-content-model.js';

function ItemListBody({
  contents,
  world,
  selection,
  verbs,
  onOpenItem,
}: {
  contents: readonly ItemRowModel[];
  world: PlacementWorld;
  selection: SelectionApi;
  verbs: ContentsVerbs;
  onOpenItem: (id: string, ids: readonly string[]) => void;
}): ReactElement {
  const ids = contents.map((item) => item.id);
  return (
    <ItemList
      label="Directly here"
      onKeyDown={(event) => {
        if (selection.onKey(event)) event.preventDefault();
      }}
    >
      {contents.map((item) => (
        <ContentRow
          key={item.id}
          item={item}
          world={world}
          selection={selection}
          ids={ids}
          verbs={verbs}
          onOpen={onOpenItem}
          inBox={false}
        />
      ))}
    </ItemList>
  );
}

function BoxList({
  boxes,
  world,
  selection,
  verbs,
  onOpenItem,
}: {
  boxes: PlaceContents['boxes'];
  world: PlacementWorld;
  selection: SelectionApi;
  verbs: ContentsVerbs;
  onOpenItem: (id: string, ids: readonly string[]) => void;
}): ReactElement {
  const ids = boxes.flatMap((group) => group.contents.map((item) => item.id));
  return (
    <ItemList
      label="In boxes here"
      onKeyDown={(event) => {
        if (selection.onKey(event)) event.preventDefault();
      }}
    >
      {boxes.map((group) => (
        <div key={`${group.box.id}-${group.depth}`} role="rowgroup" aria-label={group.box.name}>
          <BoxHeader group={group} />
          <div className={group.depth > 0 ? 'pl-6' : 'pl-2'}>
            <ItemContents
              contents={group.contents}
              world={world}
              selection={selection}
              verbs={verbs}
              ids={ids}
              onOpen={onOpenItem}
            />
          </div>
        </div>
      ))}
    </ItemList>
  );
}

/** Renders the filtered contents list for one location tab. */
export function ContentsList({
  contents,
  tab,
  world,
  selection,
  verbs,
  onOpenItem,
  tallyOf,
  onOpenPlace,
}: {
  contents: PlaceContents;
  tab: PlaceTab;
  world: PlacementWorld;
  selection: SelectionApi;
  verbs: ContentsVerbs;
  onOpenItem: (id: string, ids: readonly string[]) => void;
  tallyOf: (id: string) => PlaceTally;
  onOpenPlace: (id: string) => void;
}): ReactElement {
  if (tab === 'items') {
    return (
      <ItemListBody
        contents={contents.here}
        world={world}
        selection={selection}
        verbs={verbs}
        onOpenItem={onOpenItem}
      />
    );
  }
  if (tab === 'in-boxes') {
    return (
      <BoxList
        boxes={contents.boxes}
        world={world}
        selection={selection}
        verbs={verbs}
        onOpenItem={onOpenItem}
      />
    );
  }
  return <PlaceList places={contents.places} tallyOf={tallyOf} onOpenPlace={onOpenPlace} />;
}
