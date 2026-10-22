import { ExternalLink, FileText, Pencil, Unlink } from 'lucide-react';

import { Button } from '@pops/ui';

import { VerbButton } from '../../foundation/item-page/verb-button';

import type { ReactElement } from 'react';

import type { DetailDocument } from './detail-model';

/** Why every write on a read-only item is refused. */
export const READ_ONLY_REASON = 'Nothing can change on this item.';

/** The inventory proxy that streams a linked document's file from Paperless. */
export function documentFileHref(linkId: number): string {
  return `/api/inventory/documents/${linkId}/file`;
}

function documentKind(kind: string): string {
  return kind.length === 0 ? 'Document' : kind;
}

function DocumentOpenAction({
  document,
  actionReason,
}: {
  document: DetailDocument;
  actionReason: string | undefined;
}): ReactElement | null {
  if (document.missing) return null;
  if (actionReason === undefined) {
    return (
      <a
        href={documentFileHref(document.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="relative inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={`Open ${document.title}`}
        aria-label={`Open ${document.title}`}
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
      title={actionReason}
      aria-label={`Open ${document.title}`}
    >
      <ExternalLink className="size-4" aria-hidden />
    </Button>
  );
}

/** Why a linked-row write is refused, if it is: Paperless first, then read-only, then a write in flight. */
export function documentWriteReason(
  actionReason: string | undefined,
  readOnly: boolean,
  busy: boolean
): string | undefined {
  if (actionReason !== undefined) return actionReason;
  if (readOnly) return READ_ONLY_REASON;
  if (busy) return 'Saving document changes.';
  return undefined;
}

/** Props shared by every linked-document row. */
export interface DocumentRowActions {
  actionReason: string | undefined;
  readOnly: boolean;
  busy: boolean;
  onEdit: (document: DetailDocument) => void;
  onUnlink: (document: DetailDocument) => void;
}

function DocumentRowText({ document }: { document: DetailDocument }): ReactElement {
  return (
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
  );
}

/** One linked document: open, edit and unlink. */
export function DocumentRow({
  document,
  actionReason,
  readOnly,
  busy,
  onEdit,
  onUnlink,
}: DocumentRowActions & { document: DetailDocument }): ReactElement {
  const writeReason = documentWriteReason(actionReason, readOnly, busy);
  const unlinkReason = documentWriteReason(
    document.missing ? undefined : actionReason,
    readOnly,
    busy
  );
  return (
    <li className="flex min-h-11 items-center gap-1 px-2 py-1.5">
      <FileText className="mr-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <DocumentRowText document={document} />
      <DocumentOpenAction document={document} actionReason={actionReason} />
      {document.missing ? null : (
        <VerbButton
          label={`Edit ${document.title}`}
          icon={Pencil}
          variant="ghost"
          size="default"
          iconOnly
          disabledReason={writeReason}
          onClick={() => onEdit(document)}
        />
      )}
      <VerbButton
        label={`Unlink ${document.title}`}
        icon={Unlink}
        variant="ghost"
        size="default"
        iconOnly
        disabledReason={unlinkReason}
        onClick={() => onUnlink(document)}
        className="text-destructive hover:text-destructive"
      />
    </li>
  );
}
