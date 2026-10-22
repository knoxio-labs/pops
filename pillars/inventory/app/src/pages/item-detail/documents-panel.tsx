import { FileText, Link, Upload } from 'lucide-react';
import { useState } from 'react';

import { LinkDocumentDialog } from '../../components/LinkDocumentDialog';
import { EmptyLine, PaneLabel } from '../../foundation/item-page/section-parts';
import { VerbButton } from '../../foundation/item-page/verb-button';
import { DocumentEditDialog } from './document-edit-dialog';
import { DocumentUnlinkDialog } from './document-unlink-dialog';
import { DocumentUploadDialog } from './document-upload-dialog';
import { DocumentRow, READ_ONLY_REASON } from './documents-list';
import { FailedDocumentRow, PendingDocumentRow } from './ingestion-rows';
import { paperlessReason, PaperlessNotice } from './paperless-notice';

import type { ReactElement } from 'react';

import type {
  DetailDocument,
  DetailIngestion,
  DocumentUploadLimits,
  PaperlessState,
} from './detail-model';
import type { DocumentUploadInput } from './document-upload-api';
import type { DocumentChanges } from './use-document-mutations';

/** Everything the documents panel shows, and the writes it can ask for. */
export interface DocumentsPanelProps {
  itemId: string;
  /** Null while the item's documents are loading. */
  documents: readonly DetailDocument[] | null;
  pending: readonly DetailIngestion[];
  failed: readonly DetailIngestion[];
  /** Null while the Paperless status is loading. */
  paperless: PaperlessState | null;
  uploadLimits: DocumentUploadLimits | null;
  readOnly: boolean;
  busy: { upload: boolean; edit: boolean; unlink: boolean; dismiss: boolean };
  /** `onDone` runs once the upload was accepted, closing the dialog. */
  onUpload: (input: DocumentUploadInput, onDone: () => void) => void;
  onEdit: (id: number, changes: DocumentChanges, onDone: () => void) => void;
  onUnlink: (id: number) => void;
  onDismiss: (id: number) => void;
  onLinked: () => void;
}

function paperlessActionReason(paperless: PaperlessState | null): string | undefined {
  return paperless === null ? 'Paperless status is still loading.' : paperlessReason(paperless);
}

function DocumentRows(
  props: DocumentsPanelProps & {
    onEditRow: (document: DetailDocument) => void;
    onUnlinkRow: (document: DetailDocument) => void;
  }
): ReactElement {
  const { documents, pending, failed, readOnly, busy } = props;
  if (documents === null) return <EmptyLine icon={FileText} text="Documents are loading." />;
  if (documents.length + pending.length + failed.length === 0) {
    return <EmptyLine icon={FileText} text="No documents linked." />;
  }
  return (
    <ul aria-label="Documents" className="divide-y divide-border/60">
      {failed.map((ingestion) => (
        <FailedDocumentRow
          key={`failed-${ingestion.id}`}
          ingestion={ingestion}
          readOnly={readOnly}
          busy={busy.dismiss}
          onDismiss={props.onDismiss}
        />
      ))}
      {pending.map((ingestion) => (
        <PendingDocumentRow key={`pending-${ingestion.id}`} ingestion={ingestion} />
      ))}
      {documents.map((document) => (
        <DocumentRow
          key={document.id}
          document={document}
          actionReason={paperlessActionReason(props.paperless)}
          readOnly={readOnly}
          busy={busy.edit || busy.unlink}
          onEdit={props.onEditRow}
          onUnlink={props.onUnlinkRow}
        />
      ))}
    </ul>
  );
}

function HeaderActions({
  props,
  onAddFile,
}: {
  props: DocumentsPanelProps;
  onAddFile: () => void;
}): ReactElement {
  const reason =
    paperlessActionReason(props.paperless) ?? (props.readOnly ? READ_ONLY_REASON : undefined);
  return (
    <span className="flex items-center gap-2">
      <VerbButton label="Add file" icon={Upload} disabledReason={reason} onClick={onAddFile} />
      <LinkDocumentDialog
        itemId={props.itemId}
        onLinked={props.onLinked}
        disabledReason={reason}
        trigger={<VerbButton label="Link existing" icon={Link} disabledReason={reason} />}
      />
    </span>
  );
}

/** The item's Paperless documents: linked, processing and failed, with their actions. */
export function DocumentsPanel(props: DocumentsPanelProps): ReactElement {
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<DetailDocument | null>(null);
  const [unlinking, setUnlinking] = useState<DetailDocument | null>(null);
  return (
    <section aria-label="Documents" className="flex flex-col gap-3">
      <PaneLabel trailing={<HeaderActions props={props} onAddFile={() => setUploading(true)} />}>
        Documents
      </PaneLabel>
      {props.paperless === null ? null : <PaperlessNotice state={props.paperless} />}
      <DocumentRows {...props} onEditRow={setEditing} onUnlinkRow={setUnlinking} />
      {uploading ? (
        <DocumentUploadDialog
          itemId={props.itemId}
          limits={props.uploadLimits}
          busy={props.busy.upload}
          onOpenChange={setUploading}
          onUpload={(input) => props.onUpload(input, () => setUploading(false))}
        />
      ) : null}
      {editing === null ? null : (
        <DocumentEditDialog
          document={editing}
          busy={props.busy.edit}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSave={(changes) => props.onEdit(editing.id, changes, () => setEditing(null))}
        />
      )}
      {unlinking === null ? null : (
        <DocumentUnlinkDialog
          title={unlinking.title}
          onOpenChange={(open) => {
            if (!open) setUnlinking(null);
          }}
          onConfirm={() => props.onUnlink(unlinking.id)}
        />
      )}
    </section>
  );
}
