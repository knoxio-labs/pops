import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

/** Renders the retry action when warranty entries could not be loaded. */
export function WarrantiesFailedBody({ onRetry }: { onRetry: () => void }): ReactElement {
  return (
    <div
      role="alert"
      className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h2 className="font-semibold">Warranties did not load</h2>
      <p className="text-sm text-muted-foreground">The inventory service did not answer.</p>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
