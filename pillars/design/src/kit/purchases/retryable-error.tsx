import { Button } from '@pops/ui';

export interface RetryableErrorProps {
  /** What failed, in the screen's own words. */
  title: string;
  /** The server's own explanation, shown as sent. */
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

/**
 * A read that failed, and the retry it earns.
 *
 * Every purchases screen reads one endpoint and can fail the same way, so the
 * panel is shared and only the wording differs. It is deliberately not the
 * panel for every unhappy answer: a 404 on an order is not a failure, and
 * offering a retry for it invites a question that has already been answered.
 */
export function RetryableError({ title, message, retryLabel, onRetry }: RetryableErrorProps) {
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
