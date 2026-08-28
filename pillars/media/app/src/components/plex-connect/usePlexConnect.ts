/**
 * usePlexConnect — drives the plex.tv PIN handshake for `PlexConnectPanel`.
 *
 * Four states, derived rather than stored:
 *
 *   - no PIN in flight  → `idle` when no username is persisted, `connected`
 *                         when one is;
 *   - PIN in flight     → `pending` while plex.tv has not yet seen the code
 *                         entered at https://plex.tv/link;
 *   - PIN aged out      → `expired`, cleared by requesting a fresh one.
 *
 * The poll is a `useQuery` with a `refetchInterval` rather than a timer the
 * component owns, so unmounting the settings panel stops it. `checkAuthPin`
 * persists the encrypted token server-side the moment plex.tv hands one over,
 * so the transition to `connected` needs no follow-up write — only a refetch
 * of the username.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { unwrap } from '../../media-api-helpers.js';
import {
  plexCheckAuthPin,
  plexDisconnect,
  plexGetAuthPin,
  plexGetPlexUsername,
} from '../../media-api/index.js';

export const PLEX_PIN_POLL_INTERVAL_MS = 2000;
export const PLEX_LINK_URL = 'https://plex.tv/link';

const USERNAME_QUERY_KEY = ['media', 'plex', 'username'] as const;

export type PlexConnectStatus = 'loading' | 'connected' | 'idle' | 'pending' | 'expired';

interface PendingPin {
  id: number;
  code: string;
}

export interface PlexConnectModel {
  status: PlexConnectStatus;
  username: string | null;
  code: string | null;
  isRequestingPin: boolean;
  isDisconnecting: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'Something went wrong talking to Plex';
}

interface PinSettled {
  onExpired: () => void;
  onConnected: () => Promise<void>;
}

/**
 * Polls plex.tv for `pin` while one is outstanding. Both terminal outcomes
 * are reported through `settled`, whose handlers clear the caller's pin —
 * which disables this query and stops the interval.
 */
function usePinPoll(pin: PendingPin | null, settled: PinSettled) {
  return useQuery({
    queryKey: ['media', 'plex', 'pin-check', pin?.id],
    enabled: pin !== null,
    refetchInterval: PLEX_PIN_POLL_INTERVAL_MS,
    gcTime: 0,
    queryFn: async () => {
      const id = pin?.id;
      if (id === undefined) return null;
      const result = unwrap(await plexCheckAuthPin({ body: { id } })).data;
      if (result.expired === true) {
        settled.onExpired();
        return result;
      }
      if (result.connected) await settled.onConnected();
      return result;
    },
  });
}

export function usePlexConnect(): PlexConnectModel {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState<PendingPin | null>(null);
  const [expired, setExpired] = useState(false);

  const username = useQuery({
    queryKey: USERNAME_QUERY_KEY,
    queryFn: async () => unwrap(await plexGetPlexUsername()).data,
  });

  const check = usePinPoll(pin, {
    onExpired: () => {
      setPin(null);
      setExpired(true);
    },
    onConnected: async () => {
      setPin(null);
      setExpired(false);
      await queryClient.invalidateQueries({ queryKey: USERNAME_QUERY_KEY });
    },
  });

  const requestPin = useMutation({
    mutationFn: async () => unwrap(await plexGetAuthPin()).data,
    onSuccess: (data) => {
      setExpired(false);
      setPin({ id: data.id, code: data.code });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => unwrap(await plexDisconnect()),
    onSuccess: async () => {
      setPin(null);
      setExpired(false);
      await queryClient.invalidateQueries({ queryKey: USERNAME_QUERY_KEY });
    },
  });

  const connect = useCallback(() => requestPin.mutate(), [requestPin]);
  const disconnect = useCallback(() => disconnectMutation.mutate(), [disconnectMutation]);

  const status: PlexConnectStatus = (() => {
    if (pin !== null) return 'pending';
    if (expired) return 'expired';
    if (username.isPending) return 'loading';
    return username.data ? 'connected' : 'idle';
  })();

  const failure = requestPin.error ?? disconnectMutation.error ?? check.error;

  return {
    status,
    username: username.data ?? null,
    code: pin?.code ?? null,
    isRequestingPin: requestPin.isPending,
    isDisconnecting: disconnectMutation.isPending,
    error: failure ? messageOf(failure) : null,
    connect,
    disconnect,
  };
}
