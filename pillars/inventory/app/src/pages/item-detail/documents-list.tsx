import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Unlink } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button, Skeleton } from '@pops/ui';

import { LinkDocumentDialog } from '../../components/LinkDocumentDialog';
import { unwrap } from '../../inventory-api-helpers.js';
import { documentsListForItem, documentsUnlink } from '../../inventory-api/index.js';
import { DocumentViewAction } from './documents-list-actions';

import type { LinkedDocument } from '../../foundation/item-page';

const DOCUMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  invoice: 'Invoice',
  manual: 'Manual',
  other: 'Other',
  receipt: 'Receipt',
  warranty: 'Warranty',
};

function DocumentThumbnail({ documentId }: { documentId: number }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const source = `/inventory/documents/${documentId}/thumbnail`;
  if (status === 'error') {
    return (
      <div
        className="flex h-12 w-10 shrink-0 items-center justify-center rounded bg-muted"
        title="Document unavailable"
      >
        <FileText className="size-5 text-muted-foreground" aria-hidden />
      </div>
    );
  }
  return (
    <div className="relative h-12 w-10 shrink-0">
      {status === 'loading' ? <Skeleton className="absolute inset-0 rounded" /> : null}
      <img
        src={source}
        alt="Document thumbnail"
        className="h-12 w-10 rounded object-cover"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </div>
  );
}

function DocumentRow({
  document,
  baseUrl,
  disabledReason,
  readOnly,
  isUnlinking,
  onUnlink,
}: {
  document: LinkedDocument;
  baseUrl: string | null;
  disabledReason?: string;
  readOnly: boolean;
  isUnlinking: boolean;
  onUnlink: (id: number) => void;
}) {
  const unlinkLabel = 'Unlink document';
  return (
    <li className="group flex min-h-11 items-center gap-3 border-b border-border/60 px-2 py-1.5 last:border-b-0">
      <DocumentThumbnail documentId={document.paperlessDocumentId} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {document.title ?? `Document #${document.paperlessDocumentId}`}
        </span>
        <span className="text-xs text-muted-foreground">
          {DOCUMENT_TYPE_LABELS[document.documentType] ?? document.documentType}
        </span>
      </span>
      <DocumentViewAction
        baseUrl={baseUrl}
        disabledReason={disabledReason}
        documentId={document.paperlessDocumentId}
      />
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        disabled={readOnly || Boolean(disabledReason) || isUnlinking}
        title={disabledReason ?? unlinkLabel}
        aria-label={unlinkLabel}
        onClick={() => onUnlink(document.id)}
      >
        <Unlink className="size-4" aria-hidden />
      </Button>
    </li>
  );
}

function DocumentsContent({
  documents,
  isLoading,
  baseUrl,
  disabledReason,
  readOnly,
  isUnlinking,
  onUnlink,
}: {
  documents: readonly LinkedDocument[];
  isLoading: boolean;
  baseUrl: string | null;
  disabledReason?: string;
  readOnly: boolean;
  isUnlinking: boolean;
  onUnlink: (id: number) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents linked yet.</p>;
  }
  return (
    <ul aria-label="Documents" className="divide-y divide-border/60">
      {documents.map((document) => (
        <DocumentRow
          key={document.id}
          document={document}
          baseUrl={baseUrl}
          disabledReason={disabledReason}
          readOnly={readOnly}
          isUnlinking={isUnlinking}
          onUnlink={onUnlink}
        />
      ))}
    </ul>
  );
}

/** Reads and renders the linked Paperless documents for one item. */
export function DocumentsList({
  itemId,
  baseUrl,
  disabledReason,
  readOnly,
}: {
  itemId: string;
  baseUrl: string | null;
  disabledReason?: string;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'documents', 'listForItem', { itemId }],
    queryFn: async () => unwrap(await documentsListForItem({ path: { itemId } })),
  });
  const unlinkMutation = useMutation({
    mutationFn: async (documentId: number) =>
      unwrap(await documentsUnlink({ path: { id: documentId } })),
    onSuccess: () => toast.success('Document unlinked'),
    onError: (error: Error) => toast.error(`Failed to unlink: ${error.message}`),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['inventory', 'documents'] }),
  });
  const documents = data?.data ?? [];
  return (
    <>
      <DocumentsContent
        documents={documents}
        isLoading={isLoading}
        baseUrl={baseUrl}
        disabledReason={disabledReason}
        readOnly={readOnly}
        isUnlinking={unlinkMutation.isPending}
        onUnlink={(id) => unlinkMutation.mutate(id)}
      />
      <LinkDocumentDialog
        itemId={itemId}
        disabledReason={readOnly ? 'Nothing can change on this item.' : disabledReason}
        onLinked={() => {
          void queryClient.invalidateQueries({ queryKey: ['inventory', 'documents'] });
        }}
      />
    </>
  );
}
