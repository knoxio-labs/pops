import { useQueryClient } from '@tanstack/react-query';

import { useSourceEditor } from '../shared/useSourceEditor';
import { patchStay, stayListQueryKey, stayQueryKey } from './api';
import { staySource } from './model';

import type { QueryClient } from '@tanstack/react-query';

import type { SourceEditor } from '../shared/useSourceEditor';
import type { Stay, StayPatch, StayWorkspaceProps } from './types';
/** Serialized Stay source editor with retained failures and successful Undo snapshots. */
export type StayEditor = SourceEditor<Stay, StayPatch>;
/** Bind the shared direct editor to Stay persistence and its canonical source caches. */
export function useStayEditor(initial: Stay, props: StayWorkspaceProps): StayEditor {
  const cache = useQueryClient();
  return useSourceEditor(initial, {
    source: staySource,
    save: (patch) => patchStay(props, patch),
    onSaved: (result) => refreshStayCache(cache, props, result),
  });
}
function refreshStayCache(cache: QueryClient, props: StayWorkspaceProps, result: Stay): void {
  cache.setQueryData(stayQueryKey(props), result);
  cache.setQueryData<Stay[]>(stayListQueryKey(props), (previous) =>
    previous?.map((stay) => (stay.id === result.id ? result : stay))
  );
  void cache.invalidateQueries({ queryKey: stayListQueryKey(props) });
}
