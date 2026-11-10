import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { QueryClient } from '@tanstack/react-query';

import type {
  RetainedSession,
  RetainedSessionStore,
  RetainedSourceIdentity,
  RetainedSourceOwner,
} from './retained-session-store';

interface SessionBinding<Session> {
  cache: QueryClient;
  store: RetainedSessionStore<Session>;
  identity: RetainedSourceIdentity;
  retained: RetainedSession<Session>;
}

/** Capture a view's owner once, changing only at explicit scope or source-identity boundaries. */
export function useRetainedSession<Session>(
  store: RetainedSessionStore<Session>,
  identity: RetainedSourceIdentity,
  create: (owner: RetainedSourceOwner) => Session
): RetainedSession<Session> {
  const cache = useQueryClient();
  const bind = (): SessionBinding<Session> => ({
    cache,
    store,
    identity: { ...identity },
    retained: store.retain(cache, identity, create),
  });
  const [binding, setBinding] = useState(bind);
  if (
    binding.cache !== cache ||
    binding.store !== store ||
    binding.identity.client !== identity.client ||
    binding.identity.tripId !== identity.tripId ||
    binding.identity.kind !== identity.kind ||
    binding.identity.sourceId !== identity.sourceId
  ) {
    const next = bind();
    setBinding(next);
    return next.retained;
  }
  return binding.retained;
}
