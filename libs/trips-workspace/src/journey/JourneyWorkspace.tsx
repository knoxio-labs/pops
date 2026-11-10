import { ErrorState } from '@pops/ui';

import { JourneyAlternatives } from './JourneyAlternatives';
import { JourneyRecord } from './JourneyRecord';
import { useJourneyNavigation } from './use-journey-navigation';

import type { JSX } from 'react';

import type { JourneyWorkspaceProps } from './types';

/** Approved Departure and arrival source editor; the host supplies real identities and query context. */
export function JourneyWorkspace(props: JourneyWorkspaceProps): JSX.Element {
  if (![props.tripId, props.journeyId].every((id) => Number.isSafeInteger(id) && id > 0))
    return (
      <ErrorState
        error={{
          code: 'trips.identity.invalid',
          message: 'Choose a valid trip and journey',
          retryable: false,
        }}
      />
    );
  return (
    <WorkspaceSession
      key={`${props.client?.getConfig().baseUrl ?? '/trips-api'}:${props.tripId}`}
      {...props}
    />
  );
}

function WorkspaceSession(props: JourneyWorkspaceProps): JSX.Element {
  const navigation = useJourneyNavigation(props);
  const identity = { ...props, journeyId: navigation.viewed };
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <JourneyRecord {...identity} />
      <JourneyAlternatives identity={identity} navigation={navigation} />
    </main>
  );
}
