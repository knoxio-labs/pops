import { useQueryClient } from '@tanstack/react-query';

import { useSourceEditor } from '../shared/useSourceEditor';
import { patchVisit, visitQueryKey, visitSource } from './api';

import type { SourceEditor } from '../shared/useSourceEditor';
import type { Visit, VisitPatch, VisitWorkspaceProps } from './types';

/** Revision-guarded direct visit edits and persisted inverse operations. */
export type VisitEditor = SourceEditor<Visit, VisitPatch>;
/** Bind shared source editing to the exact confirmed revision; foreign reads never rebase an inverse. */
export function useVisitEditor(initial: Visit, props: VisitWorkspaceProps): VisitEditor {
  const cache = useQueryClient();
  return useSourceEditor(initial, {
    source: visitSource,
    save: (patch: VisitPatch, saved: Visit) =>
      patchVisit(props, { ...patch, expectedRevision: saved.revision }),
    onSaved: (result: Visit) => {
      cache.setQueryData(visitQueryKey(props), result);
      cache.setQueryData<Visit[]>(visitQueryKey(props).slice(0, 3).concat('visits'), (previous) =>
        previous?.map((visit) => (visit.id === result.id ? result : visit))
      );
      void cache.invalidateQueries({ queryKey: visitQueryKey(props).slice(0, 3).concat('visits') });
    },
  });
}
