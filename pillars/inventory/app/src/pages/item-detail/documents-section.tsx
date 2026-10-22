import { DocumentsPanel } from './documents-panel';
import { useDocumentMutations } from './use-document-mutations';

import type { ReactElement } from 'react';

import type { DetailDocument, ItemDetailModel, PaperlessState } from './detail-model';

/** Summarizes linked documents for a folded item-detail section header. */
export function documentsSummary(
  documents: readonly DetailDocument[],
  paperless: PaperlessState
): string {
  if (paperless === 'unreachable') return 'Paperless is unreachable';
  if (paperless === 'not-configured') return 'Paperless is not connected';
  if (documents.length === 0) return 'No documents linked';
  const missing = documents.filter((document) => document.missing).length;
  const kinds = [...new Set(documents.map((document) => document.kind))].join(', ');
  return missing > 0 ? `${kinds}. ${missing} deleted in Paperless` : kinds;
}

/** The item's Paperless documents, wired to the inventory document routes. */
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
  const { upload, update, unlink, dismiss } = useDocumentMutations(onLinksChanged);
  return (
    <DocumentsPanel
      itemId={itemId}
      documents={model.documents}
      pending={model.pendingDocuments}
      failed={model.failedDocuments}
      paperless={model.paperless}
      uploadLimits={model.uploadLimits}
      readOnly={readOnly}
      busy={{
        upload: upload.isPending,
        edit: update.isPending,
        unlink: unlink.isPending,
        dismiss: dismiss.isPending,
      }}
      onUpload={(input, onDone) => upload.mutate(input, { onSuccess: onDone })}
      onEdit={(id, changes, onDone) => update.mutate({ id, changes }, { onSuccess: onDone })}
      onUnlink={(id) => unlink.mutate(id)}
      onDismiss={(id) => dismiss.mutate(id)}
      onLinked={onLinksChanged}
    />
  );
}
