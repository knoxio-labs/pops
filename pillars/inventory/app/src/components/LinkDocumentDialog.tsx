import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button, SearchPickerDialog, Select, toastError } from '@pops/ui';

import { unwrap } from '../inventory-api-helpers.js';
import { documentsLink } from '../inventory-api/index.js';
import { DOCUMENT_KIND_OPTIONS, isDocumentKind } from './document-kinds';
import { linkDocumentError } from './link-document-error';
import { PaperlessDocumentResultRow } from './PaperlessDocumentResultRow';
import { usePaperlessSearch } from './use-paperless-search';

import type { ComponentPropsWithoutRef, ReactElement } from 'react';

import type { DocumentKind } from './document-kinds';
import type { PaperlessDocResult } from './PaperlessDocumentResultRow';

interface LinkDocumentDialogProps {
  itemId: string;
  onLinked: () => void;
  trigger?: ReactElement;
  /** Explains why Paperless actions are unavailable and disables the trigger. */
  disabledReason?: string;
}

function DocTypeSelect({
  docType,
  setDocType,
}: {
  docType: DocumentKind;
  setDocType: (v: DocumentKind) => void;
}) {
  return (
    <Select
      value={docType}
      onChange={(e) => {
        if (isDocumentKind(e.target.value)) setDocType(e.target.value);
      }}
      size="sm"
      options={DOCUMENT_KIND_OPTIONS}
    />
  );
}

type LinkDocumentInput = {
  itemId: string;
  paperlessDocumentId: number;
  documentType: DocumentKind;
  title: string;
};

function useLinkDocumentMutation(
  onLinked: () => void,
  setOpen: (v: boolean) => void,
  setSearch: (v: string) => void,
  setLinkingId: (v: number | null) => void
) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorHandled: true },
    mutationFn: async ({ itemId, paperlessDocumentId, documentType, title }: LinkDocumentInput) =>
      unwrap(
        await documentsLink({
          path: { itemId },
          body: { paperlessDocumentId, documentType, title },
        })
      ),
    onSuccess: () => {
      toast.success('Document linked');
      onLinked();
      setLinkingId(null);
      setOpen(false);
      setSearch('');
    },
    onError: (error: Error) => {
      setLinkingId(null);
      toastError(linkDocumentError(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'documents'] }),
  });
}

function DocumentLinkTrigger({
  disabledReason,
  ...buttonProps
}: { disabledReason?: string } & ComponentPropsWithoutRef<'button'>) {
  return (
    <Button
      {...buttonProps}
      variant="outline"
      size="sm"
      disabled={disabledReason !== undefined}
      title={disabledReason}
      aria-label={disabledReason ? `Link Document (${disabledReason})` : 'Link Document'}
    >
      <FileText className="mr-1.5 h-4 w-4" />
      Link Document
    </Button>
  );
}

/** Opens Paperless search and links a selected document to an item. */
export function LinkDocumentDialog({
  itemId,
  onLinked,
  trigger,
  disabledReason,
}: LinkDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [docType, setDocType] = useState<DocumentKind>('receipt');
  const [linkingId, setLinkingId] = useState<number | null>(null);

  const { data, isFetching, isError, refetch } = usePaperlessSearch(open, search);
  const linkMutation = useLinkDocumentMutation(onLinked, setOpen, setSearch, setLinkingId);
  const results: PaperlessDocResult[] = data?.data ?? [];

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch('');
      setLinkingId(null);
    }
  };

  return (
    <SearchPickerDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger ?? <DocumentLinkTrigger disabledReason={disabledReason} />}
      title="Link Document"
      description="Search Paperless-ngx for a document to link to this item."
      searchPlaceholder="Search documents..."
      search={search}
      onSearchChange={setSearch}
      isLoading={isFetching}
      results={results}
      errorMessage={isError ? 'Paperless search failed. Try again.' : undefined}
      onRetry={() => void refetch()}
      getResultKey={(doc: PaperlessDocResult) => doc.id}
      maxResultsHeight="max-h-72"
      trailing={<DocTypeSelect docType={docType} setDocType={setDocType} />}
      renderResult={(doc: PaperlessDocResult) => (
        <PaperlessDocumentResultRow
          doc={doc}
          linkingId={linkingId}
          isPending={linkMutation.isPending}
          onLink={(d) => {
            setLinkingId(d.id);
            linkMutation.mutate({
              itemId,
              paperlessDocumentId: d.id,
              documentType: docType,
              title: d.title,
            });
          }}
        />
      )}
    />
  );
}
