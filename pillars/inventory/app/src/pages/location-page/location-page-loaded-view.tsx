import { House, Inbox, MapPin, Sofa, SquareDashed } from 'lucide-react';
import { useMemo } from 'react';

import { useDragPlacement } from '../../foundation/drag/use-drag-placement.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { PlacesDnd } from '../../foundation/places/places-dnd.js';
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
import type { LoadedLocationState } from './location-page-loaded-state.js';
import type { LoadedLocationViewProps } from './location-page-loaded-types.js';

const PLACE_ICONS: Readonly<Record<LocationKind, LucideIcon>> = {
  property: House,
  room: MapPin,
  furniture: Sofa,
  storage: Inbox,
  area: SquareDashed,
};

function useLocationContentVerbs(
  state: LoadedLocationState,
  itemDrag: ReturnType<typeof useDragPlacement>
): LoadedLocationState['contentVerbs'] {
  return useMemo(
    () => ({
      ...state.contentVerbs,
      verbs: {
        ...state.contentVerbs.verbs,
        pendingIds: state.bulkContentVerbs.pendingIds,
        rejections: state.bulkContentVerbs.rejections,
        disabledReason: state.bulkContentVerbs.disabledReason,
        pickUp: state.bulkContentVerbs.pickUp,
        startMove: state.bulkContentVerbs.startMove,
        takeOut: state.bulkContentVerbs.takeOut,
        drag: itemDrag,
      },
    }),
    [itemDrag, state.bulkContentVerbs, state.contentVerbs]
  );
}

interface LocationSurfaceProps extends LoadedLocationViewProps {
  readonly contentVerbs: LoadedLocationState['contentVerbs'];
}

function LocationSurface({ contentVerbs, ...props }: LocationSurfaceProps): ReactElement {
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
          bulkVerbs={state.bulkContentVerbs}
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
        contentVerbs={contentVerbs}
        bulkVerbs={state.bulkContentVerbs}
        tab={tab}
        navigation={navigation}
      />
    </InventoryPage>
  );
}

/** Renders the loaded location page and its local overlays. */
export function LocationView(props: LoadedLocationViewProps): ReactElement {
  const { world, state } = props;
  const itemDrag = useDragPlacement(world, (ids, target) =>
    state.bulkContentVerbs.moveIds(ids, target, world)
  );
  const contentVerbs = useLocationContentVerbs(state, itemDrag);
  return (
    <PlacesDnd world={world} itemDrag={itemDrag}>
      <LocationSurface {...props} contentVerbs={contentVerbs} />
    </PlacesDnd>
  );
}
