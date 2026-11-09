import { useQueryClient } from '@tanstack/react-query';

import { useSourceEditor } from '../shared/useSourceEditor';
import { eventQueryKey, patchEvent } from './api';
import { eventSource } from './model';

import type { SourceEditor } from '../shared/useSourceEditor';
import type { EventPatch, EventWorkspaceProps, TripEvent } from './types';
/** Event source editor with retained failed drafts and persisted Undo snapshots. */
export type EventEditor = SourceEditor<TripEvent, EventPatch>;
/** Bind direct Event edits to the authenticated transport and origin-scoped query cache. */
export function useEventEditor(initial: TripEvent, props: EventWorkspaceProps): EventEditor {
  const cache = useQueryClient();
  return useSourceEditor(initial, {
    source: eventSource,
    save: (patch) => patchEvent(props, patch),
    onSaved: (result) => {
      cache.setQueryData(eventQueryKey(props), result);
      void cache.invalidateQueries({ queryKey: eventQueryKey(props).slice(0, 3).concat('events') });
    },
  });
}
