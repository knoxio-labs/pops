import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

export interface RetryableErrorProps {
  /** What failed, in this page's own words. */
  title: string;
  /** The server's own explanation, shown as sent. */
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

/**
 * A read that failed, and the retry it earns.
 *
 * Every page in this app reads one endpoint and can fail the same way, so the
 * panel is shared and only the wording differs — a reader who has seen one
 * failure here should recognise the next one without having to.
 *
 * It is deliberately not the panel for every unhappy answer. A `404` on an
 * order is not a failure — the request worked and the answer was that the
 * order is gone — and offering a retry for it invites the reader to ask a
 * question that has already been answered.
 */
export function RetryableError({
  title,
  message,
  retryLabel,
  onRetry,
}: RetryableErrorProps): ReactElement {
  return (
    <div role="alert" className="border-destructive/50 bg-destructive/10 rounded-md border p-4">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <p className="text-muted-foreground mb-3 text-xs">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
