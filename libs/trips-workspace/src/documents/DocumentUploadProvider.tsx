import { createContext, useContext, useMemo } from 'react';

import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { client as defaultTripsClient } from '../trips-api/client.gen';
import { documentOwnerUrl } from './document-owner-url';
import { UploadJournal } from './durable-upload-journal';
import { useUploadOwnerChanged, useUploadProviderAuthority } from './upload-provider-state';

import type { ReactNode, ReactElement } from 'react';

import type { DocumentUploadHostCapability, UploadPersistenceLease } from '@pops/pillar-sdk';

import type { DocumentAssociationTarget } from './types';
import type { UploadProviderOwner } from './upload-provider-state';

type Owner = UploadProviderOwner;
type Binding = Owner & {
  host?: DocumentUploadHostCapability;
  lease: UploadPersistenceLease | null;
  problem: string | null;
  retry: () => void;
};
const Context = createContext<Binding | null>(null);

/** Host identity and exact owner transports for existing upload controls; missing authority disables writes. */
export interface DocumentUploadProviderProps extends Owner {
  host?: DocumentUploadHostCapability;
  children: ReactNode;
}

/** Supply the verified host authority to existing upload controls, without blocking source editors or persisting File bytes. */
export function DocumentUploadProvider(props: DocumentUploadProviderProps): ReactElement {
  const parent = useContext(Context);
  const host = props.host ?? parent?.host;
  const ownerChanged = useUploadOwnerChanged(props);
  const authority = useUploadProviderAuthority(host);
  const { tripId, tripsClient, documentsClient } = props;
  const value = useMemo(
    (): Binding => ({
      tripId,
      tripsClient,
      documentsClient,
      host,
      ...authority,
      lease: !ownerChanged && authority.lease?.isCurrent() ? authority.lease : null,
      problem: ownerChanged
        ? 'The upload owner changed. Restore the original connection or open an explicit new context.'
        : authority.problem,
    }),
    [tripId, tripsClient, documentsClient, host, ownerChanged, authority]
  );
  return <Context.Provider value={value}>{props.children}</Context.Provider>;
}

/** Resolve only this provider's exact Trip/owner/target metadata; unknown identity cannot expose stored descriptors. */
export function useUploadJournal(target: DocumentAssociationTarget | null): {
  journal: UploadJournal | null;
  problem: string | null;
  retry: () => void;
} {
  const context = useContext(Context);
  const trips = context?.tripsClient ?? defaultTripsClient;
  const documents = context?.documentsClient ?? defaultDocumentsClient;
  const tripsOrigin = documentOwnerUrl(trips.getConfig().baseUrl);
  const documentsOrigin = documentOwnerUrl(documents.getConfig().baseUrl);
  const kind = target?.kind;
  const id = target?.id;
  const stableTarget = useMemo(
    () => (kind === undefined || id === undefined ? null : { kind, id }),
    [kind, id]
  );
  return useMemo(
    () => resolveUploadJournal(context, tripsOrigin, documentsOrigin, stableTarget),
    [context, tripsOrigin, documentsOrigin, stableTarget]
  );
}

type JournalResult = { journal: UploadJournal | null; problem: string | null; retry: () => void };
const noRetry = (): void => undefined;

function resolveUploadJournal(
  context: Binding | null,
  tripsOrigin: string | null,
  documentsOrigin: string | null,
  target: DocumentAssociationTarget | null
): JournalResult {
  if (
    context === null ||
    context.lease === null ||
    tripsOrigin === null ||
    documentsOrigin === null
  )
    return unavailableJournal(context);
  const retry = context.retry;
  try {
    if (
      new URL(tripsOrigin).origin !== context.lease.identity.server ||
      new URL(documentsOrigin).origin !== context.lease.identity.server
    )
      throw new Error('Verify the account on the actual upload server before using this owner.');
    return {
      journal: new UploadJournal(context.lease, {
        tripId: context.tripId,
        tripsOrigin,
        documentsOrigin,
        target,
      }),
      problem: null,
      retry,
    };
  } catch (error) {
    return {
      journal: null,
      problem: error instanceof Error ? error.message : 'Upload recovery storage is unavailable.',
      retry,
    };
  }
}

function unavailableJournal(context: Binding | null): JournalResult {
  return {
    journal: null,
    problem:
      context?.problem ??
      'Verify sign-in and allow browser storage to preserve upload recovery before sending files.',
    retry: context?.retry ?? noRetry,
  };
}
