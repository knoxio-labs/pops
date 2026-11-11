import { useTranslation } from 'react-i18next';

import { ErrorState } from '@pops/ui';

import { useSourceQuery } from '../shared/use-source-query';
import { requestProblem } from '../stay/api';
import { loadVisit, visitQueryKey } from './api';
import { useVisitContext } from './use-visit-context';
import { VisitSession } from './VisitSession';

import type { JSX } from 'react';

import type { VisitWorkspaceProps } from './types';

/** Approved direct visit editor and accommodation-period workspace over literal trip-owned identities. */
export function VisitWorkspace(props: VisitWorkspaceProps): JSX.Element {
  const { t } = useTranslation('trips');
  if (![props.tripId, props.visitId].every((value) => Number.isSafeInteger(value) && value > 0))
    return (
      <ErrorState
        error={{
          code: 'trips.identity.invalid',
          message: t('visitWorkspace.invalidIdentity'),
          retryable: false,
        }}
      />
    );
  return (
    <LoadVisit
      key={`${props.tripId}:${props.visitId}:${props.client?.getConfig().baseUrl ?? '/trips-api'}`}
      {...props}
    />
  );
}
function LoadVisit(props: VisitWorkspaceProps): JSX.Element {
  const { t } = useTranslation('trips');
  const context = useVisitContext(props);
  const source = useSourceQuery(
    { client: props.client, tripId: props.tripId, kind: 'visit', sourceId: props.visitId },
    (owner) => {
      const captured = { client: owner.client, tripId: owner.tripId, visitId: owner.sourceId };
      return { queryKey: visitQueryKey(captured), load: () => loadVisit(captured) };
    }
  );
  if (source.ownershipError) return <ErrorState error={source.ownershipError} />;
  if (source.isPending)
    return (
      <p role="status" className="p-4">
        {t('visitWorkspace.loading')}
      </p>
    );
  if (source.data === undefined)
    return (
      <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
    );
  return (
    <>
      {source.isError && (
        <ErrorState error={requestProblem(source.error)} onRetry={() => void source.refetch()} />
      )}
      <VisitSession
        initial={source.data}
        identity={props}
        context={context}
        reload={async () => {
          const result = await source.refetch();
          return result.isSuccess ? result.data : undefined;
        }}
      />
    </>
  );
}
