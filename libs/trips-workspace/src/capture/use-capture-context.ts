import { useQuery } from '@tanstack/react-query';

import { loadPlaces, loadVisits } from '../stay/api';

import type { UseQueryResult } from '@tanstack/react-query';

import type { Place, Visit } from '../stay/types';
import type { CaptureIdentity } from './types';

/** Independently available place and visit catalogues, including source failure state. */
export interface CaptureContext {
  places: UseQueryResult<Place[], Error>;
  visits: UseQueryResult<Visit[], Error>;
}

/** Optional source context loads independently and never supplies inferred capture fields. */
export function useCaptureContext(identity: CaptureIdentity): CaptureContext {
  const origin = identity.client?.getConfig().baseUrl ?? '/trips-api';
  const places = useQuery({
    queryKey: ['trips', origin, 'places'],
    queryFn: () => loadPlaces(identity.client),
    retry: false,
  });
  const visits = useQuery({
    queryKey: ['trips', origin, identity.tripId, 'visits'],
    queryFn: () => loadVisits(identity.tripId, identity.client),
    retry: false,
  });
  return { places, visits };
}
