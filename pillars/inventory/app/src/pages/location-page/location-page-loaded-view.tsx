import { House, Inbox, MapPin, Sofa, SquareDashed } from 'lucide-react';

import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { LocationBanner } from './location-page-loaded-body.js';
import {
  LocationActions,
  LocationOverlays,
  LocationTitle,
  LocationToolbar,
} from './location-page-loaded-chrome.js';
import { LocationContent } from './location-page-loaded-content.js';
import { placeCrumbs, placeSummary } from './location-page-parts.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import type { LocationKind } from '../../foundation/model/model.js';
import type { LoadedLocationViewProps } from './location-page-loaded-types.js';

const PLACE_ICONS: Readonly<Record<LocationKind, LucideIcon>> = {
  property: House,
  room: MapPin,
  furniture: Sofa,
  storage: Inbox,
  area: SquareDashed,
};

/** Renders the loaded location page and its local overlays. */
export function LocationView(props: LoadedLocationViewProps): ReactElement {
  const { place, world, tallyOf, online, edits, contents, state, tab, navigation } = props;
  return (
    <InventoryPage
      title={<LocationTitle place={place} edits={edits} />}
      icon={PLACE_ICONS[place.kind]}
      description={placeSummary(tallyOf(place.id))}
      breadcrumbs={placeCrumbs(world, place)}
      actions={
        <LocationActions
          place={place}
          world={world}
          online={online}
          edits={edits}
          state={state}
          navigation={navigation}
        />
      }
      banner={
        <LocationBanner place={place} online={online} changed={state.changed} edits={edits} />
      }
      toolbar={
        <LocationToolbar
          place={place}
          tallyOf={tallyOf}
          tab={tab}
          state={state}
          edits={edits}
          onTab={navigation.openTab}
        />
      }
      bodyClassName="gap-3"
      overlay={
        <LocationOverlays
          place={place}
          world={world}
          state={state}
          edits={edits}
          navigation={navigation}
        />
      }
    >
      <LocationContent
        place={place}
        world={world}
        tallyOf={tallyOf}
        online={online}
        edits={edits}
        contents={contents}
        state={state}
        tab={tab}
        navigation={navigation}
      />
    </InventoryPage>
  );
}
