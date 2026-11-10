import { RetainedSessionStore } from '../shared/retained-session-store';
import { useRetainedSourceEditor } from '../shared/use-retained-source-editor';
import { eventQueryKey, patchEvent } from './api';
import { eventSource } from './model';
import { useEventReferenceDrafts } from './reference-drafts';

import type { SourceEditSession } from '../shared/source-edit-session';
import type { SourceEditor } from '../shared/useSourceEditor';
import type { EventReferenceDrafts } from './reference-drafts';
import type { EventPatch, EventWorkspaceProps, TripEvent } from './types';
const sessions = new RetainedSessionStore<SourceEditSession<TripEvent, EventPatch>>();

/** Event source editor with retained failed drafts and persisted Undo snapshots. */
export type EventEditor = SourceEditor<TripEvent, EventPatch> & {
  referenceDrafts: EventReferenceDrafts;
};
/** Bind direct Event edits to the authenticated transport and origin-scoped query cache. */
export function useEventEditor(initial: TripEvent, props: EventWorkspaceProps): EventEditor {
  const referenceDrafts = useEventReferenceDrafts(props);
  const editor = useRetainedSourceEditor(
    initial,
    sessions,
    {
      client: props.client,
      tripId: props.tripId,
      kind: 'event',
      sourceId: props.eventId,
    },
    (owner) => {
      const identity = { client: owner.client, tripId: owner.tripId, eventId: owner.sourceId };
      const key = eventQueryKey(identity);
      const listKey = key.slice(0, 3).concat('events');
      return {
        source: eventSource,
        save: (patch) => patchEvent(identity, patch),
        onSaved: (result) => {
          owner.scope.setQueryData(key, result);
          void owner.scope.invalidateQueries({ queryKey: listKey });
        },
      };
    }
  );
  return { ...editor, referenceDrafts };
}
