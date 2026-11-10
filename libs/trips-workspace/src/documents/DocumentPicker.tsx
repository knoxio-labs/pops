import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { searchPaperlessDocuments } from './api';
import { PickerDialog } from './PickerDialog';
import { documentQueryKeys } from './query-keys';

import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { PaperlessSearchDocument } from './types';

/** Choose an actual owner original through a callback; no Trips association is created by this picker. */
export interface DocumentPickerProps {
  documentsClient?: DocumentsClient;
  onSelected: (document: PaperlessSearchDocument) => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialSearch?: string;
  onSearchCompleted?: (resultCount: number) => void;
  noResultsAction?: ReactNode;
  hideTrigger?: boolean;
  selectionLabel?: string;
  pendingSelectionLabel?: string;
  selectionErrorMessage?: string;
  /** Assert the retaining context immediately before owner search or a selection callback. */
  beforeRequest?: () => void;
}

/** Search current Documents originals, retaining the selection when its caller rejects the callback. */
export function DocumentPicker(props: DocumentPickerProps): ReactElement {
  const [internalOpen, setInternalOpen] = useState(false);
  const [search, setSearch] = useState(props.initialSearch ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const open = props.open ?? internalOpen;
  const query = usePickerSearch({
    open,
    search,
    client: props.documentsClient,
    beforeRequest: props.beforeRequest,
  });
  const onOpenChange = (next: boolean): void => {
    if (props.open === undefined) setInternalOpen(next);
    props.onOpenChange?.(next);
    setSearch(next ? (props.initialSearch ?? '') : '');
    if (!next) setProblem(null);
  };
  const selection = useMutation({
    meta: { errorHandled: true },
    retry: false,
    mutationFn: async (document: PaperlessSearchDocument) => {
      props.beforeRequest?.();
      return props.onSelected(document);
    },
    onSuccess: () => onOpenChange(false),
    onError: () =>
      setProblem(
        props.selectionErrorMessage ?? 'This original could not be selected. Retry your selection.'
      ),
  });
  useSearchCompletion(query, props.onSearchCompleted);
  return (
    <PickerDialog
      open={open}
      search={search}
      problem={problem}
      noResultsAction={props.noResultsAction}
      hideTrigger={props.hideTrigger}
      query={query}
      pending={selection.isPending}
      onSelect={selection.mutate}
      selectionLabel={props.selectionLabel ?? 'Choose'}
      pendingSelectionLabel={props.pendingSelectionLabel ?? 'Choosing…'}
      onOpenChange={onOpenChange}
      onSearchChange={(value) => {
        setSearch(value);
        setProblem(null);
      }}
    />
  );
}

function usePickerSearch({
  open,
  search,
  client,
  beforeRequest,
}: {
  open: boolean;
  search: string;
  client: DocumentsClient | undefined;
  beforeRequest: (() => void) | undefined;
}): UseQueryResult<PaperlessSearchDocument[], Error> {
  return useQuery({
    queryKey: documentQueryKeys.search(client, search),
    queryFn: () => {
      beforeRequest?.();
      return searchPaperlessDocuments(search, client);
    },
    enabled: open && search.length >= 2,
    retry: false,
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
