import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useMemo } from 'react';

import { SourceSessionView } from '../shared/retained-session-store';
import {
  accommodationEvents,
  accommodationStays,
  accommodationVisits,
} from './accommodation-gap-read';
import { GapCaptureSessions, useGapCaptureSession } from './GapCaptureSessions';
import { GapProblems } from './GapProblems';
import { currentSourceOwner } from './source-owner';
import { useGapCapture } from './use-gap-capture';
import { VisitCoverage } from './VisitCoverage';

import type { UseQueryResult } from '@tanstack/react-query';
import type { JSX } from 'react';

import type { TripEvent } from '../event/types';
import type { Visit, Stay } from '../stay/types';
import type {
  AccommodationGapContextProps,
  AccommodationGapProviderProps,
} from './accommodation-gap-types';
import type { GapCaptureBinding } from './gap-capture-registry';
import type { ArrangementTarget } from './types';

/** Retain exact-owner unknown creation outcomes and known Stay IDs across conditional views and provider remounts. */
export function AccommodationGapProvider(props: AccommodationGapProviderProps): JSX.Element {
  return <GapCaptureSessions {...props} />;
}
/** Render the canonical checkout-exclusive coverage action for an actual Visit, without creating route gaps or a second editor. */
export function AccommodationGapContext(props: AccommodationGapContextProps): JSX.Element {
  const binding = useGapCaptureSession(props.identity);
  return (
    <GapContext
      key={JSON.stringify([binding.staysKey, props.visitId])}
      {...props}
      binding={binding}
    />
  );
}
function GapContext(
  props: AccommodationGapContextProps & { binding: GapCaptureBinding }
): JSX.Element {
  const { binding } = props;
  const { visits, stays, events } = useAccommodationSources(binding);
  const capture = useGapCapture(props.identity, useGapDelivery(props), props.visitId);
  const visit = visits.data?.find(
    (source) => source.id === props.visitId && source.tripId === binding.identity.tripId
  );
  const error = visits.error ?? stays.error ?? events.error;
  return (
    <div className="min-w-0 space-y-2">
      {visit ? (
        <VisitCoverage
          visit={visit}
          sources={{ stays: stays.data, events: events.data, legs: new Map() }}
          complete={
            visits.isSuccess &&
            !visits.isFetching &&
            stays.isSuccess &&
            !stays.isFetching &&
            currentSourceOwner(binding.owner, binding.owner)
          }
          identity={props}
          capture={capture}
        />
      ) : (
        <p role="status" className="text-xs text-muted-foreground">
          {props.labels.unknownCoverage}
        </p>
      )}
      <GapProblems
        capture={{
          ...capture,
          failure: capture.failure ?? error ?? undefined,
          reload: async () => {
            await Promise.all([visits.refetch(), stays.refetch(), events.refetch()]);
          },
        }}
        identity={props}
      />
    </div>
  );
}

function useAccommodationSources(binding: GapCaptureBinding): {
  visits: UseQueryResult<Visit[], Error>;
  stays: UseQueryResult<Stay[], Error>;
  events: UseQueryResult<TripEvent[], Error>;
} {
  const visits = useQuery({
    queryKey: [...binding.staysKey, 'visits'],
    queryFn: () => accommodationVisits(binding),
    retry: false,
  });
  const stays = useQuery({
    queryKey: binding.staysKey,
    queryFn: () => accommodationStays(binding),
    retry: false,
  });
  const events = useQuery({
    queryKey: [...binding.staysKey, 'events'],
    queryFn: () => accommodationEvents(binding),
    retry: false,
  });
  return { visits, stays, events };
}

function useGapDelivery(
  props: AccommodationGapContextProps & { binding: GapCaptureBinding }
): (target: ArrangementTarget) => void {
  const scope = useQueryClient();
  const delivery = useMemo(
    () => ({
      callback: props.onOpenStay,
      view: new SourceSessionView({
        ...props.binding.owner,
        scope,
        kind: 'accommodation-gap',
        sourceId: props.visitId,
      }),
    }),
    [props.binding.owner, scope, props.visitId, props.onOpenStay]
  );
  useLayoutEffect(() => {
    delivery.view.activate();
    return () => delivery.view.deactivate();
  }, [delivery]);
  return (target) => {
    if (delivery.view.isCurrent())
      delivery.callback({
        tripId: props.binding.identity.tripId,
        visitId: props.visitId,
        stayId: target.targetId,
      });
  };
}
