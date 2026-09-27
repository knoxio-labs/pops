import { ContentsSelectionBar as BulkContentsSelectionBar } from '../../foundation/places/contents-bar.js';
import { ContentsSelectionBar } from './location-tab-selection-bar.js';

import type { ReactElement } from 'react';

import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { LocationTabBodyProps } from './location-tab-body.js';

/** Selects the bulk or compatibility selection bar for a location tab. */
export function SelectionBarForTab({
  props,
  selection,
}: {
  props: LocationTabBodyProps;
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
