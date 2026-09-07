import { Button } from '@pops/ui';

import type { QueueEntry } from '@/fixtures/purchases-queue';
import type { ReactElement } from 'react';

import type { DecisionOutcome } from './decisions';
import type { DecisionKind } from './types';

interface DecisionBarProps {
  activeEntry: QueueEntry | undefined;
  lastOutcome: DecisionOutcome | null;
  onDecide: (entry: QueueEntry, kind: DecisionKind) => void;
}

const OUTCOME_MESSAGE: Record<DecisionKind, string> = {
  accept: 'Accepted. The link is pinned.',
  reject: 'Link removed. The next sweep may propose it again.',
};

function outcomeMessage(outcome: DecisionOutcome | null): string {
  if (outcome === null) return '';
  if (outcome.status === 'failed') return `That decision did not stick: ${outcome.message}`;
  return OUTCOME_MESSAGE[outcome.kind];
}

/**
 * The mouse path, and the place the keyboard contract is written down.
 *
 * The buttons act on the row under the cursor rather than living inside it:
 * a `role="option"` may not contain interactive children, and a per-row
 * button would be a tab stop per row in a list that can run to hundreds. The
 * link to the order behind the cursor is here for exactly the same reason.
 */
export function DecisionBar({
  activeEntry,
  lastOutcome,
  onDecide,
}: DecisionBarProps): ReactElement {
  const disabled = activeEntry === undefined || activeEntry.proposed.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => activeEntry !== undefined && onDecide(activeEntry, 'accept')}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => activeEntry !== undefined && onDecide(activeEntry, 'reject')}
        >
          Reject
        </Button>
        {activeEntry !== undefined && (
          <a
            href={`#/purchases/${activeEntry.purchaseId}`}
            className="text-sm underline underline-offset-4"
          >
            Open the order
          </a>
        )}
        <p className="text-xs text-muted-foreground">
          j / k to move · enter to accept · x to reject
        </p>
      </div>

      <p role="status" aria-live="polite" className="text-sm">
        {outcomeMessage(lastOutcome)}
      </p>

      <p className="text-xs text-muted-foreground">
        Accepting pins the link so no later sweep revises it. Rejecting only removes the link —
        nothing records the rejection yet, so the next sweep may propose it again.
      </p>
    </div>
  );
}
