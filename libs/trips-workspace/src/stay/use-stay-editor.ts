import { RetainedSessionStore } from '../shared/retained-session-store';
import { useRetainedSourceEditor } from '../shared/use-retained-source-editor';
import { patchStay, stayListQueryKey, stayQueryKey } from './api';
import { staySource } from './model';

import type { QueryClient } from '@tanstack/react-query';

import type { SourceEditSession } from '../shared/source-edit-session';
import type { SourceEditor } from '../shared/useSourceEditor';
import type { Stay, StayPatch, StaySourceIdentity } from './types';
const sessions = new RetainedSessionStore<SourceEditSession<Stay, StayPatch>>();

/** Serialized Stay source editor with retained failures and successful Undo snapshots. */
export type StayEditor = SourceEditor<Stay, StayPatch>;
/** Bind the shared direct editor to Stay persistence and its canonical source caches. */
export function useStayEditor(initial: Stay, props: StaySourceIdentity): StayEditor {
  return useRetainedSourceEditor(
    initial,
    sessions,
    {
      client: props.client,
      tripId: props.tripId,
      kind: 'stay',
      sourceId: props.stayId,
    },
    (owner) => {
      const identity = { client: owner.client, tripId: owner.tripId, stayId: owner.sourceId };
      const key = stayQueryKey(identity);
      const listKey = stayListQueryKey(identity);
      return {
        source: staySource,
        save: (patch) => patchStay(identity, patch),
        onSaved: (result) => refreshStayCache(owner.scope, key, listKey, result),
      };
    }
  );
}
function refreshStayCache(
  cache: QueryClient,
  key: readonly unknown[],
  listKey: readonly unknown[],
  result: Stay
): void {
  cache.setQueryData(key, result);
  cache.setQueryData<Stay[]>(listKey, (previous) =>
    previous?.map((stay) => (stay.id === result.id ? result : stay))
  );
  void cache.invalidateQueries({ queryKey: listKey });
}
