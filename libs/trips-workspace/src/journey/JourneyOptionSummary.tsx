import { useQuery } from '@tanstack/react-query';

import { Badge, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { journeyKey, loadJourney } from './api';

import type { JSX } from 'react';

import type { JourneyWorkspaceProps } from './types';

/** Summarize an independent source option without borrowing clocks or purchase facts from its current peer. */
export function JourneyOptionSummary(identity: JourneyWorkspaceProps): JSX.Element {
  const source = useQuery({
    queryKey: journeyKey(identity),
    queryFn: () => loadJourney(identity),
    retry: false,
  });
  if (!source.data)
    return (
      <div>
        <h3 className="font-medium">Journey {identity.journeyId}</h3>
        {source.isError ? (
          <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
        ) : (
          <p role="status">Loading option…</p>
        )}
      </div>
    );
  const { journey, legs } = source.data;
  const purchased = legs.filter((leg) => leg.purchase === 'Purchased').length;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h3 className="font-medium">{journey.name?.trim() || `Journey ${journey.id}`}</h3>
      {purchased > 0 && (
        <Badge>
          {purchased} purchased {purchased === 1 ? 'leg' : 'legs'}
        </Badge>
      )}
      {source.isError && (
        <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
      )}
    </div>
  );
}
