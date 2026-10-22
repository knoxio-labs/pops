import { FileWarning, Hourglass, X } from 'lucide-react';

import { VerbButton } from '../../foundation/item-page/verb-button';
import { READ_ONLY_REASON } from './documents-list';

import type { ReactElement } from 'react';

import type { DetailIngestion } from './detail-model';

/** An upload Paperless is still processing. */
export function PendingDocumentRow({ ingestion }: { ingestion: DetailIngestion }): ReactElement {
  return (
    <li className="flex min-h-11 items-center gap-3 px-2 py-1.5">
      <Hourglass className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{ingestion.title}</span>
        <span role="status" className="text-xs text-muted-foreground">
          {ingestion.kind} · Processing in Paperless
        </span>
      </span>
    </li>
  );
}

/** An upload Paperless refused, with its reason and a way to clear it. */
export function FailedDocumentRow({
  ingestion,
  readOnly,
  busy,
  onDismiss,
}: {
  ingestion: DetailIngestion;
  readOnly: boolean;
  busy: boolean;
  onDismiss: (id: number) => void;
}): ReactElement {
  const busyReason = busy ? 'Dismissing the upload.' : undefined;
  return (
    <li className="flex min-h-11 items-center gap-3 px-2 py-1.5">
      <FileWarning className="size-4 shrink-0 text-destructive" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{ingestion.title}</span>
        <span className="text-xs text-destructive">
          {ingestion.reason ?? 'Paperless could not process this file.'}
        </span>
      </span>
      <VerbButton
        label={`Dismiss ${ingestion.title}`}
        icon={X}
        variant="ghost"
        size="default"
        iconOnly
        disabledReason={readOnly ? READ_ONLY_REASON : busyReason}
        onClick={() => onDismiss(ingestion.id)}
      />
    </li>
  );
}
