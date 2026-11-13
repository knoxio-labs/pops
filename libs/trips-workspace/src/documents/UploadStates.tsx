import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

import type { PaperlessTask } from './types';

/** Recover an ambiguous upload by its immutable owner operation, without filename matching. */
export function UploadOwnerLookup({
  uncertain,
  onSearch,
  pending = false,
}: {
  uncertain: boolean;
  file: File | null;
  onSearch: () => void;
  pending?: boolean;
}): ReactElement | null {
  if (!uncertain) return null;
  return (
    <Button variant="outline" disabled={pending} onClick={onSearch}>
      {pending ? 'Checking upload status…' : 'Check upload status'}
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
