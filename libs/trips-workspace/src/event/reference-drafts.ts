import { RetainedSessionStore } from '../shared/retained-session-store';
import { SemanticDraft } from '../shared/semantic-draft';
import { useRetainedSession } from '../shared/use-retained-session';
import { useSessionView } from '../shared/use-session-view';

import type { EventWorkspaceProps } from './types';

/** Incomplete opaque reference input, retained before it becomes a valid Event source patch. */
export interface EventReferenceDraft {
  uri: string;
  name: string;
}

/** Separate composer buffers for the producer's three explicit Event reference arrays. */
export interface EventReferenceDrafts {
  sourceLinks: SemanticDraft<EventReferenceDraft>;
  venueLinks: SemanticDraft<EventReferenceDraft>;
  documentLinks: SemanticDraft<EventReferenceDraft>;
  isCurrent: () => boolean;
}

const sessions = new RetainedSessionStore<Omit<EventReferenceDrafts, 'isCurrent'>>();

/** Keep unsubmitted reference text in the exact Event owner session without retaining presentation state. */
export function useEventReferenceDrafts(identity: EventWorkspaceProps): EventReferenceDrafts {
  const retained = useRetainedSession(
    sessions,
    {
      client: identity.client,
      tripId: identity.tripId,
      kind: 'event-references',
      sourceId: identity.eventId,
    },
    () => ({
      sourceLinks: new SemanticDraft({ uri: '', name: '' }),
      venueLinks: new SemanticDraft({ uri: '', name: '' }),
      documentLinks: new SemanticDraft({ uri: '', name: '' }),
    })
  );
  const view = useSessionView(retained.owner);
  return { ...retained.session, isCurrent: view.isCurrent };
}
