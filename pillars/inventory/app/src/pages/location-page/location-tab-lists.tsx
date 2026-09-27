import {
  BoxedList,
  HereList,
  PlacesList,
  type RowContext,
} from '../../foundation/places/contents-lists.js';

import type { ReactElement } from 'react';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceTab } from './location-page-parts.js';
import type { ContentsVerbs, PlaceContents } from './location-tab-content-model.js';

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
  const itemIds =
    tab === 'items'
      ? contents.here.map((item) => item.id)
      : contents.boxes.flatMap((group) => group.contents.map((item) => item.id));
  const ctx: RowContext = {
    world,
    selection,
    pendingIds: verbs.pendingIds,
    rejections: verbs.rejections,
    disabledReason: verbs.disabledReason,
    drag: verbs.drag,
    onOpenItem: (id) => onOpenItem(id, itemIds),
    onPickUp: (id) => verbs.pickUp([id]),
    onMove: (id) => verbs.startMove([id]),
    onTakeOut: (id) => verbs.takeOut([id]),
  };
  if (tab === 'items') return <HereList items={contents.here} ctx={ctx} />;
  if (tab === 'in-boxes') return <BoxedList groups={contents.boxes} ctx={ctx} />;
  return (
    <PlacesList places={contents.places} ctx={ctx} tallyOf={tallyOf} onOpenPlace={onOpenPlace} />
  );
}
