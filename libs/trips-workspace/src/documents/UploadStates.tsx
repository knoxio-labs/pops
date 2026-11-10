import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

import type { PaperlessTask } from './types';

/** Offer owner lookup only when upload acceptance is ambiguous. */
export function UploadOwnerLookup({
  uncertain,
  file,
  onSearch,
}: {
  uncertain: boolean;
  file: File | null;
  onSearch: () => void;
}): ReactElement | null {
  if (!uncertain || file === null) return null;
  return (
    <Button variant="outline" onClick={onSearch}>
      Search Documents for {file.name}
    </Button>
  );
}

/** Show the completed owner's identity action or a recoverable linking error. */
export function UploadLinkAction({
  task,
  documentId,
  pending,
  error,
  onAssociate,
}: {
  task: PaperlessTask | undefined;
  documentId: number | undefined;
  pending: boolean;
  error: string | null;
  onAssociate: () => void;
}): ReactElement | null {
  const completed = task?.state === 'done' || task?.state === 'duplicate';
  if (!completed) return null;
  if (documentId === undefined) {
    return (
      <p role="alert" className="border-l-2 border-destructive pl-3 text-sm text-foreground">
        Documents returned a completed task without an original identity.
      </p>
    );
  }
  return (
    <Button disabled={pending} onClick={onAssociate}>
      {linkLabel(error, pending)}
    </Button>
  );
}

function linkLabel(error: string | null, pending: boolean): string {
  if (pending && error !== null) return 'Retrying link…';
  if (pending) return 'Linking original…';
  if (error !== null) return 'Retry linking original';
  return 'Link file';
}

/** Display a file or owner error from the current upload attempt. */
export function UploadProblem({ message }: { message: string | null }): ReactElement | null {
  if (message === null) return null;
  return (
    <p role="alert" className="border-l-2 border-destructive pl-3 text-sm text-foreground">
      {message}
    </p>
  );
}
