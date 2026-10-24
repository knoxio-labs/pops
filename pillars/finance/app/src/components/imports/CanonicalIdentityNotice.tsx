import { Button, ErrorAlert } from '@pops/ui';

/** Explain an incomplete identity snapshot instead of showing empty groups or claiming contacts are missing. */
export function CanonicalIdentityNotice({
  status,
  retry,
}: {
  status: 'ready' | 'checking' | 'unavailable';
  retry: () => unknown;
}) {
  if (status === 'ready') return null;
  if (status === 'checking') return <p role="status">Checking contact identities…</p>;
  return (
    <div className="flex items-center gap-3">
      <ErrorAlert
        title="Contact identities unavailable"
        message="Contact identities could not be verified. Retry before grouping transactions or creating rules."
        className="flex-1"
      />
      <Button variant="outline" onClick={() => void retry()}>
        Retry
      </Button>
    </div>
  );
}
