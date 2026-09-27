import { ContentsSelectionBar as BulkContentsSelectionBar } from '../../foundation/places/contents-bar.js';
import { ContentsSelectionBar } from './location-tab-selection-bar.js';

import type { ReactElement } from 'react';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { ContentsVerbs as BulkContentsVerbs } from '../../foundation/places/use-contents-verbs.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { PlaceTab } from './location-page-parts.js';
import type { ContentsVerbs } from './location-tab-content-model.js';

interface SelectionBarProps {
  tab: PlaceTab;
  world: PlacementWorld;
  verbs: ContentsVerbs;
  bulkVerbs?: BulkContentsVerbs;
}

/** Selects the bulk or compatibility selection bar for a location tab. */
export function SelectionBarForTab({
  props,
  selection,
}: {
  props: SelectionBarProps;
  selection: SelectionApi;
}): ReactElement | null {
  if (props.tab === 'places') return null;
  if (props.bulkVerbs !== undefined) {
    return (
      <BulkContentsSelectionBar world={props.world} selection={selection} verbs={props.bulkVerbs} />
    );
  }
  return <ContentsSelectionBar world={props.world} selection={selection} verbs={props.verbs} />;
}
