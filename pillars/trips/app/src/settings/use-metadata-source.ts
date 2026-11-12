import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import {
  assertSourceOwner,
  isSourceOwnerCurrent,
  sourceOwnerProblem,
  useSessionView,
  useSourceQuery,
} from '@pops/trips-workspace';

import { metadataKeys, readMetadata } from './metadata-persistence';
import { metadataIdentity, useMetadataEntry } from './metadata-store';

import type { ApiClients, Trip } from '../api/types';
export type { MetadataFailure } from './metadata-types';

/** Bind the original metadata state to its captured owner; a fresh mount is not an acknowledgement of a new read. */
export function useMetadataSource(initial: Trip, clients: ApiClients) {
  const { owner, session: entry } = useMetadataEntry(initial.id, clients);
  const view = useSessionView(owner);
  const session = useMemo(() => entry.ensure(owner, initial), [entry, initial, owner]);
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const observed = useRef({ session, source: initial });
  useLayoutEffect(() => {
    const previous = observed.current;
    observed.current = { session, source: initial };
    if (previous.session === session && previous.source !== initial && isSourceOwnerCurrent(owner))
      session.receive(initial);
  }, [initial, owner, session]);
  return { owner, view, session, state };
}

/** Guarded GET state remains distinct from retainedSource; cache eviction or a failed GET never proves a successful read. */
export function useTripMetadataRead(tripId: number, clients: ApiClients) {
  const retained = useMetadataEntry(tripId, clients);
  const view = useSessionView(retained.owner);
  const query = useSourceQuery(metadataIdentity(tripId, clients), (owner) => ({
    queryKey: metadataKeys(owner).read,
    load: async () => {
      view.assertCurrent();
      const generation = retained.session.session?.generation;
      const value = await readMetadata(owner);
      view.assertCurrent();
      if (generation !== retained.session.session?.generation) throw sourceOwnerProblem();
      assertSourceOwner(owner);
      retained.session.session?.receive(value);
      return value;
    },
  }));
  return {
    ...query,
    retainedSource: query.ownershipError ? undefined : retained.session.session?.snapshot().saved,
  };
}
