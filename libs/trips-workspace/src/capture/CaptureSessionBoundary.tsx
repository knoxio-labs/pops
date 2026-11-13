import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { captureQueryKey, performCaptureRequest } from './api';
import { findCaptureSessionForOwner, retainCaptureSession } from './browser-session';
import { useCaptureQueryOwner } from './use-capture-owner';
import { CaptureWorkspaceReadScope } from './workspace-read';

import type { UseQueryResult } from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureWorkspaceProps } from './types';
import type { CaptureWorkspaceRead } from './workspace-read';

/** The same retained editor and captured read scope for every contextual Capture projection. */
export interface CaptureSessionView {
  session: CaptureBrowserSession;
  query: UseQueryResult<CaptureWorkspaceRead, Error>;
  scope: CaptureWorkspaceReadScope;
}
type BoundaryProps = Pick<CaptureWorkspaceProps, 'tripId' | 'client' | 'contacts'> & {
  children: (view: CaptureSessionView) => ReactNode;
};

/** Reuse the canonical owner/session registry without making another command engine or cache shape. */
export function CaptureSessionBoundary(props: BoundaryProps): JSX.Element {
  if (!Number.isSafeInteger(props.tripId) || props.tripId < 1)
    return (
      <ErrorState
        error={{ code: 'trips.identity.invalid', message: 'Choose a valid trip', retryable: false }}
      />
    );
  return <LoadSession key={JSON.stringify(captureQueryKey(props))} {...props} />;
}
function LoadSession({ children, ...props }: BoundaryProps): JSX.Element {
  const cache = useQueryClient();
  const [scope] = useState(() => new CaptureWorkspaceReadScope(props));
  const currentOwner = useCaptureQueryOwner(props);
  const select = useCallback(
    (read: CaptureWorkspaceRead) => scope.select(currentOwner, read),
    [scope, currentOwner]
  );
  const retained = findCaptureSessionForOwner(cache, scope.owner.captured);
  const query = useQuery({
    queryKey: scope.key,
    retry: false,
    queryFn: ({ signal }) => scope.load(cache, props, signal),
    select,
  });
  if (retained === undefined && query.data === undefined)
    return query.isError ? (
      <ErrorState error={requestProblem(query.error)} onRetry={() => void query.refetch()} />
    ) : (
      <p role="status" className="p-6">
        Loading source…
      </p>
    );
  const session =
    retained ??
    (query.data &&
      retainCaptureSession(cache, props, query.data.source, {
        perform: (request) => performCaptureRequest(props, request),
        contacts: props.contacts,
      }));
  if (!session) throw new Error('Missing source session');
  return <>{children({ session, query, scope })}</>;
}
