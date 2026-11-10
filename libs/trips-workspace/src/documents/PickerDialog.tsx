import { FileText, Search } from 'lucide-react';

import { Button, SearchPickerDialog } from '@pops/ui';

import { paperlessThumbnailUrl } from './api';

import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

import type { PaperlessSearchDocument, TripDocumentAssociation } from './types';

/** Present owner search results and the selection action for each original. */
export function PickerDialog({
  open,
  search,
  problem,
  noResultsAction,
  hideTrigger,
  query,
  mutation,
  onOpenChange,
  onSearchChange,
}: {
  open: boolean;
  search: string;
  problem: string | null;
  noResultsAction: ReactNode;
  hideTrigger?: boolean;
  query: UseQueryResult<PaperlessSearchDocument[], Error>;
  mutation: UseMutationResult<TripDocumentAssociation, Error, number, unknown>;
  onOpenChange: (open: boolean) => void;
  onSearchChange: (value: string) => void;
}): ReactElement {
  return (
    <SearchPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <Button
          hidden={hideTrigger}
          variant="outline"
          className="size-32 shrink-0 flex-col gap-2 whitespace-normal border-2 border-dashed border-foreground/30 bg-background px-3 text-sm"
          aria-label="Choose existing document"
        >
          <Search className="size-8 text-muted-foreground" />
          Choose existing
        </Button>
      }
      title="Choose existing"
      description="Search Documents and attach an existing original to this trip source."
      searchPlaceholder="Search documents..."
      search={search}
      onSearchChange={onSearchChange}
      isLoading={query.isFetching}
      results={query.data ?? []}
      trailing={<PickerTrailing problem={problem} action={noResultsAction} />}
      errorMessage={query.isError ? 'Documents search failed. Try again.' : undefined}
      onRetry={() => void query.refetch()}
      getResultKey={(document) => document.id}
      emptyMessage="No matching originals found."
      renderResult={(document) => (
        <PickerResult document={document} pending={mutation.isPending} onSelect={mutation.mutate} />
      )}
    />
  );
}

function PickerTrailing({
  problem,
  action,
}: {
  problem: string | null;
  action: ReactNode;
}): ReactElement | undefined {
  if (problem === null && action === undefined) return undefined;
  return (
    <div className="flex flex-col gap-2">
      {problem === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {action}
    </div>
  );
}

function PickerResult({
  document,
  pending,
  onSelect,
}: {
  document: PaperlessSearchDocument;
  pending: boolean;
  onSelect: (documentId: number) => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-md p-2.5 hover:bg-accent">
      {document.thumbnailUrl ? (
        <img
          src={paperlessThumbnailUrl(document.id)}
          alt=""
          className="h-10 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{document.title}</p>
        <p className="truncate text-xs text-muted-foreground">{document.originalFileName}</p>
      </div>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => onSelect(document.id)}>
        {pending ? 'Linking…' : 'Link'}
      </Button>
    </div>
  );
}
