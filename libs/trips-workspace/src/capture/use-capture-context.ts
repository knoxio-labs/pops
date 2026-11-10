import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useCaptureQueryOwner } from './use-capture-owner';

import type { UseQueryResult } from '@tanstack/react-query';

import type { Place, Visit } from '../stay/types';
import type { CaptureIdentity } from './types';
import type { CaptureCatalogueRead, CaptureWorkspaceReadScope } from './workspace-read';

/** Independently available place and visit catalogues, including source failure state. */
export interface CaptureContext {
  places: UseQueryResult<Place[], Error>;
  visits: UseQueryResult<Visit[], Error>;
}

/** Optional catalogues share the captured source owner while their failures remain independent of raw capture. */
export function useCaptureContext(
  identity: CaptureIdentity,
  scope: CaptureWorkspaceReadScope
): CaptureContext {
  const currentOwner = useCaptureQueryOwner(identity);
  const selectPlaces = useCallback(
    (read: CaptureCatalogueRead<Place[]>) => scope.selectPlaces(currentOwner, read),
    [scope, currentOwner]
  );
  const selectVisits = useCallback(
    (read: CaptureCatalogueRead<Visit[]>) => scope.selectVisits(currentOwner, read),
    [scope, currentOwner]
  );
  const places = useQuery({
    queryKey: scope.placesKey,
    queryFn: () => scope.loadPlaces(identity),
    select: selectPlaces,
    retry: false,
  });
  const visits = useQuery({
    queryKey: scope.visitsKey,
    queryFn: () => scope.loadVisits(identity),
    select: selectVisits,
    retry: false,
  });
  return { places, visits };
}
