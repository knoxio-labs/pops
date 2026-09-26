/**
 * `/inventory/locations`: the house as a tree beside the selected place.
 * The tree scrolls, the place's contents scroll, nothing else does. Items
 * drag from the panel onto any place in the tree (or onto the In hand strip
 * that appears while dragging); places drag within the tree. Every drag has
 * a keyboard twin in Move.
 */
import { FolderPlus, MapPin } from 'lucide-react';
import { useState } from 'react';

import { Button, cn } from '@pops/ui';

import { StateBanner } from '../foundation';
import { useItemActions } from '../location-page/use-item-actions';
import { FitPage } from './fit-page';
import { LocationTree } from './location-tree';
import { MovePlaceButton } from './move-controls';
import { PlaceOverlays } from './place-overlays';
import { PlacePreview } from './place-preview';
import { useLocations } from './use-locations';

import type {
  LocationModel,
  PlacementTarget,
  SelectionState,
  StateBannerProps,
  UndoToastProps,
} from '../foundation';
import type { ItemActionsApi } from '../location-page/use-item-actions';
import type { LocationsApi, LocationsSeed } from './use-locations';

/** Props for {@link LocationsPage}; review states pass seeds. */
export interface LocationsPageProps {
  seed: LocationsSeed;
  initialSelection?: SelectionState;
  movingPlace?: boolean;
  storeHereOpen?: boolean;
  banner?: StateBannerProps;
  toast?: UndoToastProps;
  /** Single pane, for tablet width: the tree alone, a place opens its page. */
  single?: boolean;
  onOpenPlace?: (id: string) => void;
  /** Places things were last put, for the Move picker. */
  recents?: readonly PlacementTarget[];
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function Preview({
  api,
  verbs,
  place,
  props,
  movingPlace,
  setMovingPlace,
  onStoreHere,
}: {
  api: LocationsApi;
  verbs: ItemActionsApi;
  place: LocationModel;
  props: LocationsPageProps;
  movingPlace: boolean;
  setMovingPlace: (open: boolean) => void;
  onStoreHere: () => void;
}) {
  return (
    <PlacePreview
      key={place.id}
      api={api}
      place={place}
      verbs={verbs}
      initialSelection={props.initialSelection}
      onOpen={() => props.onOpenPlace?.(place.id)}
      onStoreHere={onStoreHere}
      menu={{
        onNewInside: () => api.edits.startCreate(place.id),
        onRename: () => api.edits.startRename(place.id),
        onDelete: () => api.edits.requestDelete(place.id),
      }}
      moveControl={
        <MovePlaceButton
          world={api.world}
          place={place}
          open={movingPlace}
          onOpenChange={setMovingPlace}
          onPick={(parentId) => api.edits.moveTo(place.id, parentId)}
        />
      }
    />
  );
}

/** The page. */
export function LocationsPage(props: LocationsPageProps) {
  const api = useLocations(props.seed);
  const verbs = useItemActions(api.world, api.commit);
  const [movingPlace, setMovingPlace] = useState(props.movingPlace ?? false);
  const [storing, setStoring] = useState(props.storeHereOpen ?? false);
  const place =
    api.tree.selectedId === null ? null : (api.world.locations.get(api.tree.selectedId) ?? null);
  return (
    <FitPage
      title="Locations"
      icon={MapPin}
      description={`${count(api.world.locations.size, 'place', 'places')}. Drag things onto a place to move them there.`}
      banner={props.banner ? <StateBanner {...props.banner} /> : undefined}
      toast={props.toast}
      actions={
        <Button
          onClick={() => api.edits.startCreate(place?.id ?? null)}
          prefix={<FolderPlus className="size-4" aria-hidden />}
        >
          {place ? `New place in ${place.name}` : 'New place'}
        </Button>
      }
    >
      <div
        className={cn(
          'grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-4',
          props.single ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)]'
        )}
      >
        <LocationTree
          api={api}
          onOpen={(id) => props.onOpenPlace?.(id)}
          onMove={(id) => {
            api.tree.reveal(id);
            setMovingPlace(true);
          }}
        />
        {place && !props.single ? (
          <Preview
            api={api}
            verbs={verbs}
            place={place}
            props={props}
            movingPlace={movingPlace}
            setMovingPlace={setMovingPlace}
            onStoreHere={() => setStoring(true)}
          />
        ) : null}
      </div>
      <PlaceOverlays
        api={api}
        verbs={verbs}
        place={place}
        recents={props.recents ?? []}
        storing={storing}
        onStoringChange={setStoring}
      />
    </FitPage>
  );
}
