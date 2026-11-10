import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { currentSourceOwner } from '../arrangements/source-owner';
import { routeSession } from './registry';

import type { RouteSessionSnapshot } from './session-state';
import type { RouteEditCommand, RouteIdentity } from './types';

/** View-local read state and guarded actions over a retained owner controller. */
export interface TripRouteController extends RouteSessionSnapshot {
  run: (command: RouteEditCommand) => Promise<void>;
  retry: () => Promise<void>;
  undo: () => Promise<void>;
  reload: () => Promise<void>;
}

/** Subscribe one headless view without owning or deactivating the shared operation controller. */
export function useTripRoute(identity: RouteIdentity): TripRouteController {
  const scope = useQueryClient();
  const binding = routeSession(scope, identity);
  const lease = useMemo(() => ({ binding }), [binding]);
  const current = useRef<typeof lease | undefined>(undefined);
  useEffect(() => {
    current.current = lease;
    return () => {
      if (current.current === lease) current.current = undefined;
    };
  }, [lease]);
  const session = binding.session;
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  useQuery({
    queryKey: binding.queryKey,
    queryFn: ({ signal }) => session.load(signal),
    retry: false,
  });
  const allowed = (): boolean =>
    current.current === lease && currentSourceOwner(binding.owner, binding.owner);
  return {
    ...state,
    run: async (command: RouteEditCommand): Promise<void> => {
      if (allowed()) await session.run(command);
    },
    retry: async (): Promise<void> => {
      if (allowed()) await session.retry();
    },
    undo: async (): Promise<void> => {
      if (allowed()) await session.undo();
    },
    reload: async (): Promise<void> => {
      if (allowed()) await session.reload();
    },
  };
}
