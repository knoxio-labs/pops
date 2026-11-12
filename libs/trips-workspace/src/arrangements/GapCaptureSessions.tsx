import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useLayoutEffect, useState } from 'react';

import { GapCaptureRegistry } from './gap-capture-registry';

import type { QueryClient } from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';

import type { AccommodationGapIdentity } from './accommodation-gap-types';
import type { GapCaptureBinding } from './gap-capture-registry';

const Sessions = createContext<GapCaptureRegistry | undefined>(undefined);
const registries = new WeakMap<QueryClient, GapCaptureRegistry>();
function registry(cache: QueryClient): GapCaptureRegistry {
  let retained = registries.get(cache);
  if (!retained) {
    retained = new GapCaptureRegistry();
    registries.set(cache, retained);
  }
  return retained;
}
/** Retain non-idempotent receipts for the host QueryClient lifetime, including provider remount and cache eviction. */
export function GapCaptureSessions({
  identity,
  children,
}: {
  identity: AccommodationGapIdentity;
  children: ReactNode;
}): JSX.Element {
  const sessions = registry(useQueryClient());
  useLayoutEffect(() => sessions.acquire(identity));
  return <Sessions.Provider value={sessions}>{children}</Sessions.Provider>;
}
/** Resolve the original owner's controller; every mounted view holds an independent action lease. */
export function useGapCaptureSession(identity: AccommodationGapIdentity): GapCaptureBinding {
  const shared = useContext(Sessions);
  const retained = registry(useQueryClient());
  const sessions = shared === retained ? shared : retained;
  const cache = useQueryClient();
  const capture = (): {
    cache: QueryClient;
    sessions: GapCaptureRegistry;
    client: AccommodationGapIdentity['client'];
    tripId: number;
    binding: GapCaptureBinding;
  } => ({
    cache,
    sessions,
    client: identity.client,
    tripId: identity.tripId,
    binding: sessions.get(identity),
  });
  const [stored, setStored] = useState(capture);
  let current = stored;
  if (
    stored.cache !== cache ||
    stored.sessions !== sessions ||
    stored.client !== identity.client ||
    stored.tripId !== identity.tripId
  ) {
    current = capture();
    setStored(current);
  }
  useLayoutEffect(() => sessions.acquire(current.binding.identity));
  return current.binding;
}
