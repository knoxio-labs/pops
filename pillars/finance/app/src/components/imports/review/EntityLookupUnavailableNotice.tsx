import { Button, ErrorAlert } from '@pops/ui';

/**
 * Contacts backs every entity-existence check in the review step (accept
 * buttons, the AI-suggestion panel). When it can't be reached, guessing
 * `existing` or `new` would risk minting a duplicate or silently skipping a
 * known merchant, so those buttons disable themselves instead — this is the
 * banner that says why and offers the one recovery available.
 */
export function EntityLookupUnavailableNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <ErrorAlert
        title="Contacts unavailable"
        message="POPS cannot determine whether accepting an AI suggestion assigns an existing entity or creates a new one."
        className="flex-1"
      />
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
