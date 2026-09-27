import { PackagePlus } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { ItemList } from '../../foundation/rows/item-row.js';
import { BoxHeader, ContentRow, ItemContents } from '../location-page/location-tab-item-row.js';

import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { ContentsVerbs, PlaceContents } from '../location-page/location-tab-content-model.js';

function EmptyContents({
  place,
  hasPlaces,
  onStoreHere,
}: {
  place: LocationModel;
  hasPlaces: boolean;
  onStoreHere: () => void;
}): ReactElement {
  return (
    <EmptyState
      icon={PackagePlus}
      size="sm"
      title={`Nothing is in ${place.name}`}
      description={
        hasPlaces
          ? 'The places inside it may hold things. Open them in the tree.'
          : 'Store things here to find them later.'
      }
      action={
        <Button size="sm" onClick={onStoreHere}>
          Store here
        </Button>
      }
    />
  );
}

function listKeyDown(selection: SelectionApi, event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (selection.onKey(event)) event.preventDefault();
}

function DirectItems({
  items,
  world,
  selection,
  ids,
  verbs,
  onOpenItem,
}: {
  items: readonly ItemRowModel[];
  world: PlacementWorld;
  selection: SelectionApi;
  ids: readonly string[];
  verbs: ContentsVerbs;
  onOpenItem: (id: string, ids: readonly string[]) => void;
}): ReactElement {
  return (
    <ItemList label="Directly here" onKeyDown={(event) => listKeyDown(selection, event)}>
      {items.map((item) => (
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

function BoxedItems({
  boxes,
  world,
  selection,
  ids,
  verbs,
  onOpenItem,
}: {
  boxes: PlaceContents['boxes'];
  world: PlacementWorld;
  selection: SelectionApi;
  ids: readonly string[];
  verbs: ContentsVerbs;
  onOpenItem: (id: string, ids: readonly string[]) => void;
}): ReactElement {
  return (
    <ItemList label="In boxes here" onKeyDown={(event) => listKeyDown(selection, event)}>
      {boxes.map((group) => (
        <div key={`${group.box.id}-${group.depth}`} role="rowgroup" aria-label={group.box.name}>
          <BoxHeader group={group} drag={verbs.drag} />
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

/** Renders direct contents and nested box contents for the selected place. */
export function ItemLists({
  place,
  contents,
  world,
  selection,
  verbs,
  onOpenItem,
  onStoreHere,
}: {
  place: LocationModel;
  contents: PlaceContents;
  world: PlacementWorld;
  selection: SelectionApi;
  verbs: ContentsVerbs;
  onOpenItem: (id: string, ids: readonly string[]) => void;
  onStoreHere: () => void;
}): ReactElement {
  if (contents.here.length === 0) {
    return (
      <EmptyContents
        place={place}
        hasPlaces={contents.places.length > 0}
        onStoreHere={onStoreHere}
      />
    );
  }
  const hereIds = contents.here.map((item) => item.id);
  const boxedIds = contents.boxes.flatMap((group) => group.contents.map((item) => item.id));
  const allIds = [...hereIds, ...boxedIds];
  return (
    <>
      <h3 className="flex items-baseline gap-2 px-1 text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        Directly here <span className="tabular-nums">{contents.here.length}</span>
      </h3>
      <DirectItems
        items={contents.here}
        world={world}
        selection={selection}
        ids={allIds}
        verbs={verbs}
        onOpenItem={onOpenItem}
      />
      {contents.boxes.length > 0 ? (
        <>
          <h3 className="flex items-baseline gap-2 px-1 text-2xs font-semibold uppercase tracking-label text-muted-foreground">
            In boxes here <span className="tabular-nums">{contents.boxedCount}</span>
          </h3>
          <BoxedItems
            boxes={contents.boxes}
            world={world}
            selection={selection}
            ids={boxedIds}
            verbs={verbs}
            onOpenItem={onOpenItem}
          />
        </>
      ) : null}
    </>
  );
}
