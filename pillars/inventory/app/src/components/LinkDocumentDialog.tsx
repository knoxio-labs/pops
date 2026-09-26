import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Link2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button, formatDate, SearchPickerDialog, Select } from '@pops/ui';

import { unwrap } from '../inventory-api-helpers.js';
import { documentsLink, paperlessSearch } from '../inventory-api/index.js';

import type { ComponentPropsWithoutRef } from 'react';

interface PaperlessDocResult {
  id: number;
  title: string;
  created: string;
  originalFileName: string;
  thumbnailUrl: string;
}

const DOCUMENT_TYPES = ['receipt', 'warranty', 'manual', 'invoice', 'other'] as const;

interface LinkDocumentDialogProps {
  itemId: string;
  onLinked: () => void;
  /** Explains why Paperless actions are unavailable and disables the trigger. */
  disabledReason?: string;
}

interface DocumentResultRowProps {
  doc: PaperlessDocResult;
  linkingId: number | null;
  isPending: boolean;
  onLink: (doc: PaperlessDocResult) => void;
}

function DocumentResultRow({ doc, linkingId, isPending, onLink }: DocumentResultRowProps) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-md hover:bg-accent transition-colors">
      {doc.thumbnailUrl ? (
        <img src={doc.thumbnailUrl} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
      ) : (
        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{doc.title}</div>
        <div className="text-xs text-muted-foreground">
          {doc.created ? formatDate(doc.created) : 'No date'}
          {doc.originalFileName ? ` · ${doc.originalFileName}` : ''}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onLink(doc)} disabled={isPending}>
        {linkingId === doc.id ? (
          <span className="text-xs">Linking...</span>
        ) : (
          <Link2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

type DocType = (typeof DOCUMENT_TYPES)[number];

function isDocType(value: string): value is DocType {
  return DOCUMENT_TYPES.some((documentType) => documentType === value);
}

const DOC_TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({
  value: t,
  label: t.charAt(0).toUpperCase() + t.slice(1),
}));

function DocTypeSelect({
  docType,
  setDocType,
}: {
  docType: DocType;
  setDocType: (v: DocType) => void;
}) {
  return (
    <Select
      value={docType}
      onChange={(e) => {
        if (isDocType(e.target.value)) setDocType(e.target.value);
      }}
      size="sm"
      options={DOC_TYPE_OPTIONS}
    />
  );
}

type LinkDocumentInput = {
  itemId: string;
  paperlessDocumentId: number;
  documentType: DocType;
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
    onError: (err: Error) => {
      setLinkingId(null);
      if (err.message.toLowerCase().includes('conflict')) {
        toast.error('This document is already linked to this item');
      } else {
        toast.error(`Failed to link: ${err.message}`);
      }
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
export function LinkDocumentDialog({ itemId, onLinked, disabledReason }: LinkDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [docType, setDocType] = useState<DocType>('receipt');
  const [linkingId, setLinkingId] = useState<number | null>(null);

  const searchInput = { query: search };
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'paperless', 'search', searchInput],
    queryFn: async () => unwrap(await paperlessSearch({ query: searchInput })),
    enabled: open && search.length >= 2,
  });
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
      trigger={<DocumentLinkTrigger disabledReason={disabledReason} />}
      title="Link Document"
      description="Search Paperless-ngx for a document to link to this item."
      searchPlaceholder="Search documents..."
      search={search}
      onSearchChange={setSearch}
      isLoading={isLoading}
      results={results}
      getResultKey={(doc: PaperlessDocResult) => doc.id}
      maxResultsHeight="max-h-72"
      trailing={<DocTypeSelect docType={docType} setDocType={setDocType} />}
      renderResult={(doc: PaperlessDocResult) => (
        <DocumentResultRow
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
