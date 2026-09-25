/**
 * `/inventory/locations/:id`: one place. Its header says where it is and
 * what it holds; three tabs split its contents (things directly here,
 * things in boxes here, places inside) so no list pushes another off the
 * page. Store here is the primary action; New place inside, Move, Rename
 * and Delete sit beside it.
 */
import { useState } from 'react';

import { StateBanner } from '../foundation';
import { FitPage, PLACE_ICONS } from '../locations-tree/fit-page';
import { NameInput } from '../locations-tree/name-input';
import { PlaceOverlays } from '../locations-tree/place-overlays';
import { placeSummary } from '../locations-tree/place-summary';
import { tallyPlace } from '../locations-tree/tree-model';
import { useLocations } from '../locations-tree/use-locations';
import { PlaceActions, PlaceToolbar, defaultTab, placeCrumbs } from './location-page-parts';
import { LocationTabBody } from './location-tab-body';
import { PlaceGone } from './place-gone';
import { useItemActions } from './use-item-actions';

import type {
  LocationModel,
  PlacementTarget,
  SelectionState,
  StateBannerProps,
  UndoToastProps,
} from '../foundation';
import type { LocationsApi, LocationsSeed } from '../locations-tree/use-locations';
import type { PlaceTab } from './location-tab-body';

/** Props for {@link LocationPage}; review states pass seeds. */
export interface LocationPageProps {
  seed: LocationsSeed & { selectedId: string };
  tab?: PlaceTab;
  query?: string;
  initialSelection?: SelectionState;
  storeHereOpen?: boolean;
  movingPlace?: boolean;
  banner?: StateBannerProps;
  toast?: UndoToastProps;
  recents?: readonly PlacementTarget[];
}

function Title({ api, place }: { api: LocationsApi; place: LocationModel }) {
  if (api.edits.renamingId !== place.id) return <>{place.name}</>;
  return (
    <NameInput
      initial={place.name}
      label={`Rename ${place.name}`}
      onCommit={api.edits.commitRename}
      onCancel={() => api.edits.startRename(null)}
      className="w-80 text-base"
    />
  );
}

/** The location page. */
export function LocationPage(props: LocationPageProps) {
  const api = useLocations(props.seed);
  const verbs = useItemActions(api.world, api.commit);
  const [tab, setTab] = useState(props.tab ?? defaultTab(api.world, props.seed.selectedId));
  const [query, setQuery] = useState(props.query ?? '');
  const [storing, setStoring] = useState(props.storeHereOpen ?? false);
  const [movingPlace, setMovingPlace] = useState(props.movingPlace ?? false);
  const place = api.world.locations.get(api.tree.selectedId ?? props.seed.selectedId);
  if (place === undefined) return <PlaceGone />;
  return (
    <FitPage
      title={<Title api={api} place={place} />}
      icon={PLACE_ICONS[place.kind]}
      breadcrumbs={placeCrumbs(api.world, place)}
      description={placeSummary(tallyPlace(api.world, place.id))}
      banner={props.banner ? <StateBanner {...props.banner} /> : undefined}
      toast={props.toast}
      actions={
        <PlaceActions
          api={api}
          place={place}
          movingPlace={movingPlace}
          setMovingPlace={setMovingPlace}
          showPlaces={() => setTab('places')}
          onStoreHere={() => setStoring(true)}
        />
      }
    >
      <PlaceToolbar
        world={api.world}
        place={place}
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
      />
      <LocationTabBody
        key={tab}
        api={api}
        place={place}
        tab={tab}
        query={query}
        verbs={verbs}
        initialSelection={props.initialSelection}
        onStoreHere={() => setStoring(true)}
        onClearQuery={() => setQuery('')}
      />
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
