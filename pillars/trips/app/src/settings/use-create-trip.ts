import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { sourceOwnerProblem } from '@pops/trips-workspace';

import { client as defaultTripClient } from '../trips-api/client.gen';
import { TripCreationView } from './create-trip-owner';
import { cacheTripCreation } from './create-trip-persistence';
import { retainTripCreation } from './create-trip-store';
import { sameCreationDraft } from './create-trip-types';

import type { ApiClients, Trip } from '../api/types';
import type { TripCreationState } from './create-trip-types';
import type { TripDraft } from './model';

/** Bind the existing form to a retained durable command; close/unmount never retry or discard an unresolved creation. */
export function useCreateTrip(clients: ApiClients, created: (trip: Trip) => void, open: boolean) {
  const scope = useQueryClient();
  const client = clients.tripClient ?? defaultTripClient;
  const [binding, bind] = useState(() => ({
    scope,
    client,
    session: retainTripCreation(scope, client),
  }));
  let current = binding;
  if (binding.scope !== scope || binding.client !== client) {
    current = { scope, client, session: retainTripCreation(scope, client) };
    bind(current);
  }
  const { session } = current;
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const view = useMemo(() => new TripCreationView(session.owner), [session]);
  useLayoutEffect(() => {
    if (open) view.activate();
    return () => view.deactivate();
  }, [open, view]);
  useEffect(() => {
    if (!open || !state.confirmed || !view.isCurrent()) return;
    const result = session.takeConfirmation();
    if (!result) return;
    cacheTripCreation(session.owner, result.current.trip);
    if (view.isCurrent()) created(result.current.trip);
  }, [created, open, session, state.confirmed, view]);
  const ownerCurrent = (client.getConfig().baseUrl ?? '') === session.owner.origin;
  return {
    ...state,
    draft: state.locked ? (state.submitted ?? state.draft) : state.draft,
    locked: state.locked || !ownerCurrent,
    canRetry: canRetryCreation(state, ownerCurrent),
    error: ownerCurrent ? state.error : sourceOwnerProblem(),
    change: (draft: TripDraft): void => {
      if (view.isCurrent()) session.change(draft);
    },
    create: (): void => {
      if (view.isCurrent()) void session.create();
    },
    retry: (): void => {
      if (view.isCurrent()) void session.retry();
    },
    cancel: (): void => {
      if (view.isCurrent()) session.cancel();
    },
  };
}

function canRetryCreation(state: TripCreationState, ownerCurrent: boolean): boolean {
  return (
    ownerCurrent &&
    !state.busy &&
    state.submitted !== undefined &&
    (state.locked || sameCreationDraft(state.draft, state.submitted))
  );
}
