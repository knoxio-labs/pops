import { useState } from 'react';

import { Badge } from '@pops/ui';

import { SpendingReadContent } from './spending-read';
import { SpendingRecoveryContent } from './spending-recovery';

import type { CraftFinanceIntent, CraftSpendingState } from '@/fixtures/trip-timeline-craft-types';

function handoffPreview(intent: CraftFinanceIntent) {
  switch (intent.kind) {
    case 'choose-trip-tag':
      return 'Preview only: choose the shared trip tag before Finance records appear here.';
    case 'refresh-spending':
      return 'Preview only: reload the trip’s tagged Finance transactions.';
    case 'open-manual-entry':
      return 'Preview only: add a transaction in Finance, then link it to this trip.';
    case 'open-transaction':
      return 'Preview only: open this original transaction in Finance.';
    case 'retry-trip-link':
      return 'Preview only: retry the trip link for the same saved transaction.';
    case 'find-existing-transaction':
      return 'Preview only: search Finance for an existing transaction before creating another.';
    case 'link-existing-transaction':
      return 'Preview only: link the selected Finance transaction to this trip.';
  }
}

/** Keeps spending compact in the Timeline and previews actions owned by Finance or Tags. */
export function CraftSpendingSection({
  state,
  onIntent,
}: {
  state: CraftSpendingState;
  onIntent?: (intent: CraftFinanceIntent) => void;
}) {
  const [preview, setPreview] = useState<string>();
  const tagLabel = 'tagLabel' in state ? state.tagLabel : undefined;
  const dispatch = (intent: CraftFinanceIntent) => {
    setPreview(handoffPreview(intent));
    onIntent?.(intent);
  };
  const content =
    state.kind === 'tag-missing' ||
    state.kind === 'loading' ||
    state.kind === 'unavailable' ||
    state.kind === 'partial' ||
    state.kind === 'ready' ? (
      <SpendingReadContent state={state} onIntent={dispatch} />
    ) : (
      <SpendingRecoveryContent state={state} onIntent={dispatch} />
    );

  return (
    <section aria-labelledby="craft-spending-title" className="my-5 space-y-2 border-y py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="craft-spending-title" className="text-sm font-semibold">
            Spending
          </h2>
        </div>
        {tagLabel && <Badge variant="secondary">Trip tag: {tagLabel}</Badge>}
      </div>
      {preview && (
        <p
          role="status"
          className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground"
        >
          {preview}
        </p>
      )}
      {content}
    </section>
  );
}
