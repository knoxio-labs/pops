import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

import type { PaperlessTask } from './types';

/** Present task lifecycle state and keep retry available when status lookup fails. */
export function UploadTaskStatus({
  task,
  error,
  onRetry,
}: {
  task: PaperlessTask | undefined;
  error: boolean;
  onRetry: () => void;
}): ReactElement | null {
  if (error) {
    return (
      <div role="alert" className="flex flex-col gap-2 text-sm text-destructive">
        <p>
          Documents task status is unavailable. The accepted upload and task identity are retained.
        </p>
        <Button variant="outline" onClick={onRetry}>
          Retry status check
        </Button>
      </div>
    );
  }
  if (task === undefined || task.state === 'pending') {
    return (
      <p role="status" className="text-sm">
        Upload accepted. Waiting for the owner to verify its original identity…
      </p>
    );
  }
  if (task.state === 'failed') {
    return (
      <p role="alert" className="text-sm text-destructive">
        Documents could not accept this file{task.reason ? `: ${task.reason}` : '.'}
      </p>
    );
  }
  return null;
}
