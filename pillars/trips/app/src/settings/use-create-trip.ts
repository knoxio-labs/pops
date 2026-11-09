import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { createTrip, tripKeys } from '../api/source';

import type { ApiClients, Trip, TripInput } from '../api/types';

/** Create once per in-flight action and retain the canonical persisted result; creation has no reversal. */
export function useCreateTrip(clients: ApiClients, created: (trip: Trip) => void) {
  const cache = useQueryClient();
  const lock = useRef(false);
  const keys = tripKeys(clients);
  const mutation = useMutation({
    mutationFn: (input: TripInput) => createTrip(input, clients),
    onSuccess: (trip) => {
      cache.setQueryData(keys.one(trip.id), trip);
      cache.setQueryData<Trip[]>(keys.all, (previous) => [
        ...(previous ?? []).filter((item) => item.id !== trip.id),
        trip,
      ]);
      void cache.invalidateQueries({ queryKey: keys.all });
      created(trip);
    },
    onSettled: () => {
      lock.current = false;
    },
  });
  return {
    ...mutation,
    create: (input: TripInput): void => {
      if (!lock.current) {
        lock.current = true;
        mutation.mutate(input);
      }
    },
  };
}
