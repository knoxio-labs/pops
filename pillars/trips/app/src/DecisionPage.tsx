import { useParams } from 'react-router';

import { DecisionWorkspace } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { navConfig } from './nav';
import { sourceId } from './source-id';

/** Mount the approved source workspace using route identities and published parent navigation. */
export function DecisionPage() {
  const params = useParams();
  const tripId = sourceId(params.tripId);
  const decisionId = sourceId(params.decisionId);
  return tripId === undefined || decisionId === undefined ? (
    <ErrorState
      error={{
        code: 'trips.identity.invalid',
        message: 'Choose a valid trip and decision',
        retryable: false,
      }}
    />
  ) : (
    <DecisionWorkspace tripId={tripId} decisionId={decisionId} backHref={navConfig.basePath} />
  );
}
