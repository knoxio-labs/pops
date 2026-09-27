import { useMutation } from '@tanstack/react-query';
import { ExternalLink, FileText, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@pops/ui';

import { LinkDocumentDialog } from '../../components/LinkDocumentDialog';
import { EmptyLine, PaneLabel } from '../../foundation/item-page/section-parts';
import { VerbButton } from '../../foundation/item-page/verb-button';
import { unwrap } from '../../inventory-api-helpers.js';
import { documentsUnlink } from '../../inventory-api/index.js';
import { paperlessReason, PaperlessNotice } from './paperless-notice';

import type { ReactElement } from 'react';

import type { DetailDocument, ItemDetailModel } from './detail-model';

function documentHref(baseUrl: string, documentId: number): string {
  return `${baseUrl}/documents/${documentId}/details`;
}

function documentKind(kind: string): string {
  return kind.length === 0 ? 'Document' : kind;
}

function DocumentOpenAction({
  baseUrl,
  actionReason,
  documentId,
}: {
  baseUrl: string | null;
  actionReason: string | undefined;
  documentId: number;
}): ReactElement {
  if (baseUrl !== null && actionReason === undefined) {
    return (
      <a
        href={documentHref(baseUrl, documentId)}
        target="_blank"
        rel="noopener noreferrer"
        className="relative inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Open in Paperless"
        aria-label="Open in Paperless"
      >
        <ExternalLink className="size-4" aria-hidden />
      </a>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled
      title={actionReason ?? 'Paperless is not available'}
      aria-label="Open in Paperless"
    >
      <ExternalLink className="size-4" aria-hidden />
    </Button>
  );
}

function unlinkReason(
  actionReason: string | undefined,
  readOnly: boolean,
  isUnlinking: boolean
): string | undefined {
  if (actionReason !== undefined) return actionReason;
  if (readOnly) return 'Nothing can change on this item.';
  if (isUnlinking) return 'Unlinking document.';
  return undefined;
}

function DocumentRow({
  document,
  baseUrl,
  actionReason,
  readOnly,
  isUnlinking,
  onUnlink,
}: {
  document: DetailDocument;
  baseUrl: string | null;
  actionReason: string | undefined;
  readOnly: boolean;
  isUnlinking: boolean;
  onUnlink: (id: number) => void;
}): ReactElement {
  const disabledReason = unlinkReason(actionReason, readOnly, isUnlinking);
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-border/60 px-2 py-1.5 last:border-b-0">
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{document.title}</span>
        <span className="text-xs text-muted-foreground">
          {documentKind(document.kind)} · {document.added}
        </span>
      </span>
      <DocumentOpenAction
        baseUrl={baseUrl}
        actionReason={actionReason}
        documentId={document.paperlessDocumentId}
      />
      <VerbButton
        label="Unlink document"
        icon={Unlink}
        variant="ghost"
        iconOnly
        disabledReason={disabledReason}
        onClick={() => onUnlink(document.id)}
        className="text-destructive hover:text-destructive"
      />
    </li>
  );
}

function DocumentsList({
  documents,
  baseUrl,
  actionReason,
  readOnly,
  isUnlinking,
  onUnlink,
}: {
  documents: readonly DetailDocument[];
  baseUrl: string | null;
  actionReason: string | undefined;
  readOnly: boolean;
  isUnlinking: boolean;
  onUnlink: (id: number) => void;
}): ReactElement {
  if (documents.length === 0) {
    return <EmptyLine icon={FileText} text="No documents linked." />;
  }
  return (
    <ul aria-label="Documents" className="divide-y divide-border/60">
      {documents.map((document) => (
        <DocumentRow
          key={document.id}
          document={document}
          baseUrl={baseUrl}
          actionReason={actionReason}
          readOnly={readOnly}
          isUnlinking={isUnlinking}
          onUnlink={onUnlink}
        />
      ))}
    </ul>
  );
}

/** Renders Paperless documents and preserves the section during outages. */
export function DocumentsSection({
  itemId,
  model,
  readOnly,
  onLinksChanged,
}: {
  itemId: string;
  model: ItemDetailModel;
  readOnly: boolean;
  onLinksChanged: () => void;
}): ReactElement {
  const unlinkMutation = useMutation({
    mutationFn: async (documentId: number) =>
      unwrap(await documentsUnlink({ path: { id: documentId } })),
    onSuccess: () => {
      toast.success('Document unlinked');
      onLinksChanged();
    },
    onError: (error: Error) => toast.error(`Failed to unlink: ${error.message}`),
  });
  const state = model.paperless;
  const actionReason =
    state === null ? 'Paperless status is still loading.' : paperlessReason(state);
  const triggerReason = actionReason ?? (readOnly ? 'Nothing can change on this item.' : undefined);

  return (
    <section aria-label="Documents" className="flex flex-col gap-3">
      <PaneLabel
        trailing={
          <LinkDocumentDialog
            itemId={itemId}
            onLinked={onLinksChanged}
            disabledReason={triggerReason}
            trigger={
              <VerbButton label="Link document" icon={FileText} disabledReason={triggerReason} />
            }
          />
        }
      >
        Documents
      </PaneLabel>
      {state !== null ? <PaperlessNotice state={state} /> : null}
      {model.documents === null ? (
        <EmptyLine icon={FileText} text="Documents are loading." />
      ) : (
        <DocumentsList
          documents={model.documents}
          baseUrl={model.paperlessBaseUrl}
          actionReason={actionReason}
          readOnly={readOnly}
          isUnlinking={unlinkMutation.isPending}
          onUnlink={(id) => unlinkMutation.mutate(id)}
        />
      )}
    </section>
  );
}
