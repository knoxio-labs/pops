/**
 * The body of the location page's current tab: one list that scrolls, the
 * selection bar under it, and the empty or no-match line when there is
 * nothing to list. The inline new-place row sits at the top of Places.
 */
import { FolderPlus, PackagePlus, SearchX } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { useSelection } from '../foundation';
import { NameInput } from '../locations-tree/name-input';
import { ContentsSelectionBar } from './contents-bar';
import { BoxedList, HereList, PlacesList } from './contents-lists';
import { filterContents, placeContents } from './contents-model';

import type { LocationModel, SelectionState } from '../foundation';
import type { LocationsApi } from '../locations-tree/use-locations';
import type { PlaceContents } from './contents-model';
import type { RowContext } from './contents-rows';
import type { ItemActionsApi } from './use-item-actions';

/** The page's three tabs. */
export type PlaceTab = 'items' | 'in-boxes' | 'places';

/** Props for {@link LocationTabBody}. */
export interface LocationTabBodyProps {
  api: LocationsApi;
  place: LocationModel;
  tab: PlaceTab;
  query: string;
  verbs: ItemActionsApi;
  initialSelection?: SelectionState;
  onStoreHere: () => void;
  onClearQuery: () => void;
}

function rowIds(contents: PlaceContents, tab: PlaceTab): string[] {
  if (tab === 'items') return contents.here.map((entry) => entry.id);
  if (tab === 'in-boxes')
    return contents.boxes.flatMap((group) => group.contents.map((entry) => entry.id));
  return [];
}

function listLength(contents: PlaceContents, tab: PlaceTab): number {
  if (tab === 'items') return contents.here.length;
  if (tab === 'in-boxes') return contents.boxedCount;
  return contents.places.length;
}

const EMPTY_COPY: Readonly<Record<PlaceTab, { title: string; description: string }>> = {
  items: {
    title: 'Nothing sits directly here',
    description: 'Store things here, or look in the boxes and places inside.',
  },
  'in-boxes': {
    title: 'No boxes here hold anything',
    description: 'Things inside a box in this place are listed here, box by box.',
  },
  places: {
    title: 'No places inside',
    description: 'Add a shelf, drawer or cupboard to file things more precisely.',
  },
};

function Empty({ props, filtered }: { props: LocationTabBodyProps; filtered: boolean }) {
  if (filtered) {
    return (
      <EmptyState
        icon={SearchX}
        size="sm"
        title={`Nothing in ${props.place.name} matches “${props.query.trim()}”`}
        action={
          <Button size="sm" variant="outline" onClick={props.onClearQuery}>
            Clear search
          </Button>
        }
      />
    );
  }
  const copy = EMPTY_COPY[props.tab];
  const action =
    props.tab === 'places' ? (
      <Button
        size="sm"
        onClick={() => props.api.edits.startCreate(props.place.id)}
        prefix={<FolderPlus className="size-4" aria-hidden />}
      >
        New place inside
      </Button>
    ) : (
      <Button
        size="sm"
        onClick={props.onStoreHere}
        prefix={<PackagePlus className="size-4" aria-hidden />}
      >
        Store here
      </Button>
    );
  return (
    <EmptyState
      icon={props.tab === 'places' ? FolderPlus : PackagePlus}
      size="sm"
      title={copy.title}
      description={copy.description}
      action={action}
    />
  );
}

/** The tab body. */
export function LocationTabBody(props: LocationTabBodyProps) {
  const { api, place, tab } = props;
  const all = placeContents(api.world, place.id);
  const contents = filterContents(all, props.query);
  const ids = rowIds(contents, tab);
  const selection = useSelection(ids, props.initialSelection);
  const ctx: RowContext = {
    world: api.world,
    selection,
    drag: api.itemDrag,
    onPickUp: (id) => props.verbs.pickUp([id]),
    onMove: (id) => props.verbs.startMove([id]),
    onTakeOut: (id) => props.verbs.takeOut([id]),
  };
  const creating = tab === 'places' && api.edits.creatingUnder === place.id;
  const empty = listLength(contents, tab) === 0 && !creating;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {creating ? (
          <div className="mb-2 flex h-11 items-center rounded-lg border bg-card px-3">
            <NameInput
              label="Name of the new place"
              placeholder={`Name the new place in ${place.name}, then Enter`}
              onCommit={api.edits.commitCreate}
              onCancel={() => api.edits.startCreate(undefined)}
            />
          </div>
        ) : null}
        {empty ? (
          <div className="rounded-xl border border-dashed bg-card">
            <Empty props={props} filtered={props.query.trim() !== '' && listLength(all, tab) > 0} />
          </div>
        ) : null}
        {!empty && tab === 'items' ? <HereList items={contents.here} ctx={ctx} /> : null}
        {!empty && tab === 'in-boxes' ? <BoxedList groups={contents.boxes} ctx={ctx} /> : null}
        {tab === 'places' && contents.places.length > 0 ? (
          <PlacesList
            places={contents.places}
            ctx={ctx}
            onOpenPlace={(id) => api.tree.reveal(id)}
          />
        ) : null}
      </div>
      <ContentsSelectionBar
        world={api.world}
        selection={selection}
        loadedCount={ids.length}
        verbs={props.verbs}
      />
    </div>
  );
}
