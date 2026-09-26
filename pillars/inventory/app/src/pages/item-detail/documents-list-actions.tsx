import { ExternalLink } from 'lucide-react';

import { Button } from '@pops/ui';

interface DocumentViewActionProps {
  baseUrl: string | null;
  disabledReason?: string;
  documentId: number;
}

/** Renders the Paperless link or its disabled explanation for a document. */
export function DocumentViewAction({
  baseUrl,
  disabledReason,
  documentId,
}: DocumentViewActionProps) {
  const viewLabel = 'View in Paperless';
  if (baseUrl && !disabledReason) {
    return (
      <a
        href={`${baseUrl}/documents/${documentId}/details`}
        target="_blank"
        rel="noopener noreferrer"
        className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        title={viewLabel}
        aria-label={viewLabel}
      >
        <ExternalLink className="size-4" aria-hidden />
      </a>
    );
  }
  if (!disabledReason) return null;
  return (
    <Button variant="ghost" size="icon" disabled title={disabledReason} aria-label={viewLabel}>
      <ExternalLink className="size-4" aria-hidden />
    </Button>
  );
}
