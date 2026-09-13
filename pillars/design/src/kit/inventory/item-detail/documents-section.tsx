import {
  LinkDocumentDialog,
  type LinkDocumentDialogProps,
} from '@/kit/inventory/documents/link-document-dialog';
import { FileText } from 'lucide-react';

import { Skeleton } from '@pops/ui';

import { DocumentsBody, type LinkedDoc } from './documents-section-parts';

/**
 * Everything `LinkDocumentDialog` needs, taken from the dialog rather than
 * restated, so a prop added there cannot go unthreaded here.
 */
type LinkDialogProps = LinkDocumentDialogProps;

function DocumentsList({
  docs,
  docsLoading,
  paperlessBaseUrl,
  onUnlink,
  isUnlinking,
  linkDialog,
}: {
  docs: LinkedDoc[];
  docsLoading: boolean;
  paperlessBaseUrl: string | null;
  onUnlink: (id: number) => void;
  isUnlinking: boolean;
  linkDialog: LinkDialogProps;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents
          {docs.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({docs.length})</span>
          )}
        </h2>
        <LinkDocumentDialog {...linkDialog} />
      </div>
      <DocumentsBody
        isLoading={docsLoading}
        docs={docs}
        paperlessBaseUrl={paperlessBaseUrl}
        onUnlink={onUnlink}
        isUnlinking={isUnlinking}
      />
    </section>
  );
}

function DocumentsHeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5" />
        Documents
      </h2>
      {children}
    </section>
  );
}

interface DocumentsSectionProps {
  statusLoading: boolean;
  configured: boolean;
  available: boolean;
  paperlessBaseUrl: string | null;
  docs: LinkedDoc[];
  docsLoading: boolean;
  onUnlink: (id: number) => void;
  isUnlinking: boolean;
  linkDialog: LinkDialogProps;
}

export function DocumentsSection({
  statusLoading,
  configured,
  available,
  paperlessBaseUrl,
  docs,
  docsLoading,
  onUnlink,
  isUnlinking,
  linkDialog,
}: DocumentsSectionProps) {
  if (!statusLoading && !configured) return null;
  if (statusLoading) {
    return (
      <DocumentsHeaderShell>
        <Skeleton className="h-12 w-full" />
      </DocumentsHeaderShell>
    );
  }
  if (!available) {
    return (
      <DocumentsHeaderShell>
        <p className="text-sm text-muted-foreground">Paperless-ngx unavailable</p>
      </DocumentsHeaderShell>
    );
  }
  return (
    <DocumentsList
      docs={docs}
      docsLoading={docsLoading}
      paperlessBaseUrl={paperlessBaseUrl}
      onUnlink={onUnlink}
      isUnlinking={isUnlinking}
      linkDialog={linkDialog}
    />
  );
}
