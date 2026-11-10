import { RetainedSessionStore } from '../shared/retained-session-store';
import { useRetainedSourceEditor } from '../shared/use-retained-source-editor';
import { patchVisit, visitQueryKey, visitSource } from './api';

import type { SourceEditSession } from '../shared/source-edit-session';
import type { SourceEditor } from '../shared/useSourceEditor';
import type { Visit, VisitPatch, VisitWorkspaceProps } from './types';

const sessions = new RetainedSessionStore<SourceEditSession<Visit, VisitPatch>>();

/** Revision-guarded direct visit edits and persisted inverse operations. */
export type VisitEditor = SourceEditor<Visit, VisitPatch>;
/** Bind shared source editing to the exact confirmed revision; foreign reads never rebase an inverse. */
export function useVisitEditor(initial: Visit, props: VisitWorkspaceProps): VisitEditor {
  return useRetainedSourceEditor(
    initial,
    sessions,
    {
      client: props.client,
      tripId: props.tripId,
      kind: 'visit',
      sourceId: props.visitId,
    },
    (owner) => {
      const identity = { client: owner.client, tripId: owner.tripId, visitId: owner.sourceId };
      const key = visitQueryKey(identity);
      const listKey = key.slice(0, 3).concat('visits');
      return {
        source: visitSource,
        save: (patch, saved) =>
          patchVisit(identity, { ...patch, expectedRevision: saved.revision }),
        onSaved: (result) => {
          owner.scope.setQueryData(key, result);
          owner.scope.setQueryData<Visit[]>(listKey, (previous) =>
            previous?.map((visit) => (visit.id === result.id ? result : visit))
          );
          void owner.scope.invalidateQueries({ queryKey: listKey });
        },
      };
    }
  );
}
