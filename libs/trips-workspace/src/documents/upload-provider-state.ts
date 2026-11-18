import { useCallback, useEffect, useMemo, useState } from 'react';

import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { client as defaultTripsClient } from '../trips-api/client.gen';
import { documentOwnerUrl } from './document-owner-url';

import type { DocumentUploadHostCapability, UploadPersistenceLease } from '@pops/pillar-sdk';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';

/** Exact source transports supplied by the retaining upload host. */
export type UploadProviderOwner = {
  tripId: number;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
};

/** View authority snapshot published by the host capability. */
export type UploadProviderAuthority = {
  lease: UploadPersistenceLease | null;
  problem: string | null;
  retry: () => void;
};

/** Capture URLs with their actual client instances; a mutable origin change cannot retarget existing metadata. */
export function useUploadOwnerChanged(props: UploadProviderOwner): boolean {
  const trips = props.tripsClient ?? defaultTripsClient;
  const documents = props.documentsClient ?? defaultDocumentsClient;
  const capture = (): {
    tripId: number;
    trips: TripsClient;
    documents: DocumentsClient;
    tripsUrl: string | null;
    documentsUrl: string | null;
  } => ({
    tripId: props.tripId,
    trips,
    documents,
    tripsUrl: documentOwnerUrl(trips.getConfig().baseUrl),
    documentsUrl: documentOwnerUrl(documents.getConfig().baseUrl),
  });
  const [storedOwner, setStoredOwner] = useState(capture);
  let owner = storedOwner;
  if (
    !Object.is(owner.tripId, props.tripId) ||
    owner.trips !== trips ||
    owner.documents !== documents
  ) {
    owner = capture();
    setStoredOwner(owner);
  }
  return (
    owner.tripsUrl !== documentOwnerUrl(trips.getConfig().baseUrl) ||
    owner.documentsUrl !== documentOwnerUrl(documents.getConfig().baseUrl)
  );
}

/** Subscribe this mounted provider to capability changes without altering retained upload sessions. */
export function useUploadProviderAuthority(
  host: DocumentUploadHostCapability | undefined
): UploadProviderAuthority {
  const [state, setState] = useState<{
    host: typeof host;
    lease: UploadPersistenceLease | null;
    problem: string | null;
  }>(() => ({ host, lease: host?.current() ?? null, problem: null }));
  useEffect(() => {
    let current = true;
    const receive = (): void => {
      if (current)
        setState({ host, lease: host?.current() ?? null, problem: host?.problem() ?? null });
    };
    const unsubscribe = host?.subscribe(receive);
    if (host !== undefined) void host.verify().then(receive, receive);
    else receive();
    return () => {
      current = false;
      unsubscribe?.();
    };
  }, [host]);
  const retry = useCallback((): void => {
    if (host !== undefined)
      void host.verify().then(
        () => undefined,
        () => undefined
      );
  }, [host]);
  return useMemo(
    () => ({
      lease: state.host === host ? state.lease : null,
      problem: state.host === host ? state.problem : null,
      retry,
    }),
    [state, host, retry]
  );
}
