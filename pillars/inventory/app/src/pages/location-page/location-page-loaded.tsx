import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { useLoadedLocationState, type LoadedLocationState } from './location-page-loaded-state.js';
import { LocationView } from './location-page-loaded-view.js';
import { defaultTab, parsePlaceTab, type PlaceTab } from './location-page-parts.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { LoadedLocationViewProps, LocationNavigation } from './location-page-loaded-types.js';

function useLocationNavigation(
  place: LocationModel,
  state: LoadedLocationState
): LocationNavigation {
  const navigate = useNavigate();
  const openTab = useCallback(
    (nextTab: PlaceTab) => {
      const params = new URLSearchParams(state.route.search);
      params.set('tab', nextTab === 'in-boxes' ? 'in-containers' : nextTab);
      const search = params.toString();
      void navigate(
        { pathname: state.route.pathname, search: search === '' ? '' : `?${search}` },
        { replace: true }
      );
    },
    [navigate, state.route.pathname, state.route.search]
  );
  const openPlace = useCallback(
    (id: string) => void navigate(`/inventory/locations/${id}`),
    [navigate]
  );
  const openItem = useCallback(
    (id: string, ids: readonly string[]) => {
      void navigate(`/inventory/items/${id}`, {
        state: { listName: place.name, href: `${state.route.pathname}${state.route.search}`, ids },
      });
    },
    [navigate, place.name, state.route.pathname, state.route.search]
  );
  const openNewItem = useCallback(() => {
    state.setStoreHereOpen(false);
    void navigate(`/inventory/items/new?in=${encodeURIComponent(place.id)}`);
  }, [navigate, place.id, state]);
  return { openTab, openPlace, openItem, openNewItem };
}

/** Renders the loaded location page and its local overlays. */
export function LoadedLocationPage(
  props: Omit<LoadedLocationViewProps, 'state' | 'tab' | 'navigation'>
): ReactElement {
  const state = useLoadedLocationState(
    props.place,
    props.contents.world,
    props.online,
    props.contents.status === 'success'
  );
  const requestedTab = parsePlaceTab(new URLSearchParams(state.route.search).get('tab'));
  const tab = requestedTab ?? defaultTab(props.tallyOf(props.place.id));
  const navigation = useLocationNavigation(props.place, state);
  return <LocationView {...props} state={state} tab={tab} navigation={navigation} />;
}
