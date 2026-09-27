import { useMutation } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';

import { LinkDocumentDialog } from '../../components/LinkDocumentDialog';
import { EmptyLine, PaneLabel } from '../../foundation/item-page/section-parts';
import { VerbButton } from '../../foundation/item-page/verb-button';
import { unwrap } from '../../inventory-api-helpers.js';
import { documentsUnlink } from '../../inventory-api/index.js';
import { DocumentsList } from './documents-list';
import { paperlessReason, PaperlessNotice } from './paperless-notice';

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
