import { ExternalLink, FileText, Unlink } from 'lucide-react';

import { Button } from '@pops/ui';

import { EmptyLine } from '../../foundation/item-page/section-parts';
import { VerbButton } from '../../foundation/item-page/verb-button';

import type { ReactElement } from 'react';

import type { DetailDocument } from './detail-model';

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
  missing,
}: {
  baseUrl: string | null;
  actionReason: string | undefined;
  documentId: number;
  missing: boolean;
}): ReactElement | null {
  if (missing) return null;
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
  const disabledReason = unlinkReason(
    document.missing ? undefined : actionReason,
    readOnly,
    isUnlinking
  );
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-border/60 px-2 py-1.5 last:border-b-0">
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={
            document.missing
              ? 'truncate text-sm text-muted-foreground line-through'
              : 'truncate text-sm font-medium'
          }
        >
          {document.title}
        </span>
        <span className="text-xs text-muted-foreground">
          {document.missing
            ? 'Deleted in Paperless. Unlink it to tidy up.'
            : `${documentKind(document.kind)} · ${document.added}`}
        </span>
      </span>
      <DocumentOpenAction
        baseUrl={baseUrl}
        actionReason={actionReason}
        documentId={document.paperlessDocumentId}
        missing={document.missing}
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

/** Renders the linked-document rows while preserving their action contracts. */
export function DocumentsList({
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
