import { FolderPlus, PackagePlus, SearchX } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { useSelection, type SelectionApi } from '../../foundation/selection/use-selection.js';
import { useShortcutScope } from '../../foundation/shortcuts/shortcut-provider.js';
import {
  filterContents,
  placeContents,
  visibleRowIds,
  type ContentsVerbs,
  type PlaceContents,
} from './location-tab-content-model.js';
import { InlineCreate } from './location-tab-inline-create.js';
import { ContentsList } from './location-tab-lists.js';
import { ContentsSelectionBar } from './location-tab-selection-bar.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceEditsApi, PlaceTab } from './location-page-parts.js';

/** Inputs required to render one location page tab body. */
export interface LocationTabBodyProps {
  place: LocationModel;
  tab: PlaceTab;
  query: string;
  world: PlacementWorld;
  edits: PlaceEditsApi;
  verbs: ContentsVerbs;
  tallyOf: (id: string) => PlaceTally;
  offline: boolean;
  onStoreHere: () => void;
  onClearQuery: () => void;
  onOpenPlace: (id: string) => void;
  /** Opens a thing with this tab's visible row ids as its list trail. */
  onOpenItem: (id: string, ids: readonly string[]) => void;
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

function listLength(contents: PlaceContents, tab: PlaceTab): number {
  if (tab === 'items') return contents.here.length;
  if (tab === 'in-boxes') return contents.boxedCount;
  return contents.places.length;
}

function EmptyTab({
  place,
  tab,
  query,
  filtered,
  edits,
  offline,
  onStoreHere,
  onClearQuery,
}: {
  place: LocationModel;
  tab: PlaceTab;
  query: string;
  filtered: boolean;
  edits: PlaceEditsApi;
  offline: boolean;
  onStoreHere: () => void;
  onClearQuery: () => void;
}): ReactElement {
  if (filtered) {
    return (
      <EmptyState
        icon={SearchX}
        size="sm"
        title={`Nothing in ${place.name} matches “${query.trim()}”`}
        action={
          <Button size="sm" variant="outline" onClick={onClearQuery}>
            Clear search
          </Button>
        }
      />
    );
  }
  const copy = EMPTY_COPY[tab];
  const places = tab === 'places';
  const Icon: LucideIcon = places ? FolderPlus : PackagePlus;
  return (
    <EmptyState
      icon={Icon}
      size="sm"
      title={copy.title}
      description={copy.description}
      action={
        <Button
          size="sm"
          disabled={offline}
          onClick={places ? () => edits.startCreate(place.id) : onStoreHere}
          prefix={<Icon className="size-4" aria-hidden />}
        >
          {places ? 'New place inside' : 'Store here'}
        </Button>
      }
    />
  );
}

function useLocationTabShortcuts(
  tab: PlaceTab,
  ids: readonly string[],
  selection: SelectionApi,
  props: LocationTabBodyProps
): void {
  useShortcutScope('list', {
    'list-open': () => {
      const focused = selection.state.focusedId;
      if (focused === null) return false;
      if (tab === 'places') props.onOpenPlace(focused);
      else props.onOpenItem(focused, ids);
      return true;
    },
    'pick-up': () => {
      if (selection.count === 0) return false;
      props.verbs.pickUp(selection.selectedIds);
      return true;
    },
    move: () => {
      if (selection.count === 0) return false;
      props.verbs.startMove(selection.selectedIds);
      return true;
    },
    'take-out': () => {
      if (selection.count === 0) return false;
      props.verbs.takeOut(selection.selectedIds);
      return true;
    },
    dismiss: () => {
      if (selection.count === 0) return false;
      selection.clearSelection();
      return true;
    },
  });
}

/** Renders a location's selected tab, search state, rows, and selection bar. */
export function LocationTabBody(props: LocationTabBodyProps): ReactElement {
  const all = placeContents(props.world, props.place.id);
  const contents = filterContents(all, props.query);
  const ids = props.tab === 'places' ? [] : visibleRowIds(contents, props.tab);
  const selection = useSelection(ids);
  useLocationTabShortcuts(props.tab, ids, selection, props);
  const visibleCount = listLength(contents, props.tab);
  const totalCount = listLength(all, props.tab);
  const filtered = props.query.trim() !== '' && totalCount > 0 && visibleCount === 0;
  const creating = props.tab === 'places' && props.edits.creatingUnder === props.place.id;
  const empty = visibleCount === 0 && !creating;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {creating ? <InlineCreate place={props.place} edits={props.edits} /> : null}
        {empty ? (
          <div className="rounded-xl border border-dashed bg-card">
            <EmptyTab
              place={props.place}
              tab={props.tab}
              query={props.query}
              filtered={filtered}
              edits={props.edits}
              offline={props.offline}
              onStoreHere={props.onStoreHere}
              onClearQuery={props.onClearQuery}
            />
          </div>
        ) : (
          <ContentsList
            contents={contents}
            tab={props.tab}
            world={props.world}
            selection={selection}
            verbs={props.verbs}
            onOpenItem={props.onOpenItem}
            tallyOf={props.tallyOf}
            onOpenPlace={props.onOpenPlace}
          />
        )}
      </div>
      {props.tab === 'places' ? null : (
        <ContentsSelectionBar world={props.world} selection={selection} verbs={props.verbs} />
      )}
    </div>
  );
}
