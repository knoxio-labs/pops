import { useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@pops/pillar-sdk/client';

import { associatePaperlessDocument } from './api';
import { DocumentPicker } from './DocumentPicker';
import { documentQueryKeys } from './query-keys';

import type { ReactElement } from 'react';

import type { Client as TripsClient } from '../trips-api/client';
import type { DocumentPickerProps } from './DocumentPicker';
import type { DocumentAssociationTarget, PaperlessSearchDocument } from './types';

/** Associate an owner-selected original with this exact Trips target after selection succeeds. */
export interface DocumentAssociationPickerProps extends Omit<DocumentPickerProps, 'onSelected'> {
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient?: TripsClient;
  onAssociated?: () => void;
}

/** Compose owner selection with a typed Trips link; an existing association conflict is idempotent success. */
export function DocumentAssociationPicker(props: DocumentAssociationPickerProps): ReactElement {
  const queryClient = useQueryClient();
  const onSelected = async (document: PaperlessSearchDocument): Promise<void> => {
    try {
      props.beforeRequest?.();
      await associatePaperlessDocument(props.tripId, document.id, props.target, props.tripsClient);
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'trips.document.association_exists'))
        throw error;
    }
    void queryClient.invalidateQueries({
      queryKey: documentQueryKeys.associations(props.tripsClient, props.tripId),
    });
    props.onAssociated?.();
  };
  return (
    <DocumentPicker
      {...props}
      onSelected={onSelected}
      selectionLabel="Link"
      pendingSelectionLabel="Linking…"
      selectionErrorMessage="This original could not be linked. Your selection is still available; retry the link."
    />
  );
}
