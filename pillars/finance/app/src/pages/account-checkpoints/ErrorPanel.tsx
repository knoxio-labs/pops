import { Alert, AlertDescription, Button } from '@pops/ui';

/** A retryable failure panel, shared by the account-level and checkpoints-level query errors on this page. */
export function ErrorPanel({
  heading,
  message,
  onRetry,
}: {
  heading: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <p className="font-semibold text-foreground">{heading}</p>
        <p>{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
