import { FileText, Search } from 'lucide-react';

import { Button, cn, SearchPickerDialog } from '@pops/ui';

import { paperlessThumbnailUrl } from './api';

import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

import type { PaperlessSearchDocument } from './types';

/** Present owner search results and the selection action for each original. */
export function PickerDialog({
  open,
  search,
  problem,
  noResultsAction,
  hideTrigger,
  compact,
  query,
  pending,
  onSelect,
  selectionLabel,
  pendingSelectionLabel,
  onOpenChange,
  onSearchChange,
}: {
  open: boolean;
  search: string;
  problem: string | null;
  noResultsAction: ReactNode;
  hideTrigger?: boolean;
  compact?: boolean;
  query: UseQueryResult<PaperlessSearchDocument[], Error>;
  pending: boolean;
  onSelect: (document: PaperlessSearchDocument) => void;
  selectionLabel: string;
  pendingSelectionLabel: string;
  onOpenChange: (open: boolean) => void;
  onSearchChange: (value: string) => void;
}): ReactElement {
  return (
    <SearchPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={pickerTrigger(hideTrigger, compact)}
      title="Choose existing"
      description="Search Documents to choose an original file."
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
        <PickerResult
          document={document}
          pending={pending}
          onSelect={onSelect}
          selectionLabel={selectionLabel}
          pendingSelectionLabel={pendingSelectionLabel}
        />
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
  selectionLabel,
  pendingSelectionLabel,
}: {
  document: PaperlessSearchDocument;
  pending: boolean;
  onSelect: (document: PaperlessSearchDocument) => void;
  selectionLabel: string;
  pendingSelectionLabel: string;
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
      <Button variant="outline" size="sm" disabled={pending} onClick={() => onSelect(document)}>
        {pending ? pendingSelectionLabel : selectionLabel}
      </Button>
    </div>
  );
}

function pickerTrigger(hidden: boolean | undefined, compact: boolean | undefined): ReactElement {
  return (
    <Button
      hidden={hidden}
      variant="outline"
      className={cn(
        'shrink-0 gap-2 border-dashed bg-background px-3 text-sm',
        compact
          ? 'h-11 flex-row'
          : 'size-32 flex-col whitespace-normal border-2 border-foreground/30'
      )}
      aria-label="Choose existing document"
    >
      <Search className={cn('text-muted-foreground', compact ? 'size-4' : 'size-8')} aria-hidden />
      Choose existing
    </Button>
  );
}
