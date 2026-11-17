import { FileText } from 'lucide-react';

import type { JSX } from 'react';

import type { OverviewDocument, OverviewLabels } from './types';

/** Displays the exact linked document identities without querying Documents for row metadata. */
export function OverviewOriginals({
  documents,
  labels,
  unknownLabel,
}: {
  documents?: OverviewDocument[];
  labels: OverviewLabels;
  unknownLabel?: string;
}): JSX.Element {
  if (documents === undefined && unknownLabel) return <>{unknownLabel}</>;
  if (!documents?.length) return <>—</>;
  return (
    <span className="flex min-w-0 flex-wrap gap-1.5">
      {documents.map((document) => (
        <span
          key={document.documentId}
          className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground"
        >
          <FileText className="size-3 shrink-0" aria-hidden />
          <span className="break-words">{labels.source('document', document.documentId)}</span>
        </span>
      ))}
    </span>
  );
}
