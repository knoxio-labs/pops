import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ApiError } from '@pops/pillar-sdk/client';

import { associatePaperlessDocument, searchPaperlessDocuments } from './api';
import { PickerDialog } from './PickerDialog';
import { documentQueryKeys } from './query-keys';

import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type {
  DocumentAssociationTarget,
  PaperlessSearchDocument,
  TripDocumentAssociation,
} from './types';

/** Search Documents originals and attach one to the caller's explicit Trips target. */
export function DocumentAssociationPicker(props: {
  tripId: number;
  target: DocumentAssociationTarget;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
  onAssociated?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialSearch?: string;
  onSearchCompleted?: (resultCount: number) => void;
  noResultsAction?: ReactNode;
  hideTrigger?: boolean;
}): ReactElement {
  const [internalOpen, setInternalOpen] = useState(false);
  const [search, setSearch] = useState(props.initialSearch ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const open = props.open ?? internalOpen;
  const query = usePickerSearch(open, search, props.documentsClient);
  const mutation = usePickerAssociation(
    {
      ...props,
      onOpenChange: (next) => {
        if (props.open === undefined) setInternalOpen(next);
        props.onOpenChange?.(next);
      },
    },
    setSearch,
    setProblem
  );
  useSearchCompletion(query, props.onSearchCompleted);
  const onOpenChange = (next: boolean): void => {
    if (props.open === undefined) setInternalOpen(next);
    props.onOpenChange?.(next);
    setSearch(next ? (props.initialSearch ?? '') : '');
    if (!next) setProblem(null);
  };
  return (
    <PickerDialog
      open={open}
      search={search}
      problem={problem}
      noResultsAction={props.noResultsAction}
      hideTrigger={props.hideTrigger}
      query={query}
      mutation={mutation}
      onOpenChange={onOpenChange}
      onSearchChange={(value) => {
        setSearch(value);
        setProblem(null);
      }}
    />
  );
}

function usePickerSearch(
  open: boolean,
  search: string,
  client: DocumentsClient | undefined
): UseQueryResult<PaperlessSearchDocument[], Error> {
  return useQuery({
    queryKey: documentQueryKeys.search(client, search),
    queryFn: () => searchPaperlessDocuments(search, client),
    enabled: open && search.length >= 2,
    retry: false,
  });
}

function usePickerAssociation(
  props: Parameters<typeof DocumentAssociationPicker>[0],
  setSearch: (value: string) => void,
  setProblem: (value: string | null) => void
): UseMutationResult<TripDocumentAssociation, Error, number, unknown> {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorHandled: true },
    mutationFn: (documentId: number) =>
      associatePaperlessDocument(props.tripId, documentId, props.target, props.tripsClient),
    onSuccess: () => closeAfterAssociation(props, setSearch, setProblem, queryClient),
    onError: (error) =>
      handleAssociationError({ error, props, setSearch, setProblem, queryClient }),
  });
}

function useSearchCompletion(
  query: UseQueryResult<PaperlessSearchDocument[], Error>,
  callback: ((count: number) => void) | undefined
): void {
  useEffect(() => {
    if (query.isSuccess && query.data !== undefined) callback?.(query.data.length);
  }, [callback, query.data, query.isSuccess]);
}

function closeAfterAssociation(
  props: Parameters<typeof DocumentAssociationPicker>[0],
  setSearch: (value: string) => void,
  setProblem: (value: string | null) => void,
  queryClient: ReturnType<typeof useQueryClient>
): void {
  setProblem(null);
  setSearch('');
  props.onOpenChange?.(false);
  void queryClient.invalidateQueries({
    queryKey: documentQueryKeys.associations(props.tripsClient, props.tripId),
  });
  props.onAssociated?.();
}

function handleAssociationError({
  error,
  props,
  setSearch,
  setProblem,
  queryClient,
}: {
  error: Error;
  props: Parameters<typeof DocumentAssociationPicker>[0];
  setSearch: (value: string) => void;
  setProblem: (value: string | null) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}): void {
  if (error instanceof ApiError && error.code === 'trips.document.association_exists') {
    closeAfterAssociation(props, setSearch, setProblem, queryClient);
    return;
  }
  setProblem(
    'This original could not be linked. Your selection is still available; retry the link.'
  );
}
