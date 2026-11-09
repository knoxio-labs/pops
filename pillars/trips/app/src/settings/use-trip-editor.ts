import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { tripKeys, updateTrip } from '../api/source';
import { draftInput, tripDraft } from './model';
import { useMetadataSource } from './use-metadata-source';

import type { QueryClient } from '@tanstack/react-query';

import type { ApiClients, Trip } from '../api/types';
import type { TripDraft } from './model';

/** Source-backed settings save/Undo preserves failed drafts and unrelated source-link ownership. */
export function useTripEditor(initial: Trip, clients: ApiClients) {
  const source = useMetadataSource(initial);
  const cache = useQueryClient();
  const lock = useRef(false);
  const persist = async (undo?: Trip): Promise<void> => {
    if (lock.current) return;
    lock.current = true;
    source.setBusy(true);
    source.setFailure(undefined);
    try {
      const result = await updateTrip(
        source.saved.id,
        draftInput(undo ? tripDraft(undo) : source.draft, tripDraft(source.saved)),
        clients
      );
      refreshCache(cache, clients, result);
      source.setHistory((previous) => (undo ? previous.slice(0, -1) : [...previous, source.saved]));
      source.setSaved(result);
      source.setDraft(tripDraft(result));
    } catch (error) {
      source.setFailure({ error, undo });
    } finally {
      lock.current = false;
      source.setBusy(false);
    }
  };
  return {
    draft: source.draft,
    previous: tripDraft(source.saved),
    dirty: source.dirty,
    busy: source.busy,
    failure: source.failure,
    canUndo: source.history.length > 0 && !source.dirty && !source.busy && !source.failure,
    change: (next: TripDraft): void => {
      source.setDraft(next);
      if (source.failure?.undo) source.setFailure(undefined);
    },
    save: (): Promise<void> => persist(),
    undo: (): Promise<void> => {
      const previous = source.history.at(-1);
      return previous ? persist(previous) : Promise.resolve();
    },
    discard: (): void => {
      source.setDraft(tripDraft(source.saved));
      source.setFailure(undefined);
    },
    retry: (): Promise<void> => persist(source.failure?.undo),
  };
}

function refreshCache(cache: QueryClient, clients: ApiClients, result: Trip): void {
  const keys = tripKeys(clients);
  cache.setQueryData(keys.one(result.id), result);
  cache.setQueryData<Trip[]>(keys.all, (previous) =>
    previous?.map((trip) => (trip.id === result.id ? result : trip))
  );
  void cache.invalidateQueries({ queryKey: keys.all });
}
