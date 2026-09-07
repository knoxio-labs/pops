import { formatCents, formatDate } from '@pops/ui';

import { ExtractedReading } from './extracted-reading';
import { Field, OutcomeSection, StoredParts } from './outcome-parts';

import type {
  CreatedOutcome,
  GateFailure,
  NeedsReviewOutcome,
  ReceiptSubmission,
  UnreadableOutcome,
} from '@/fixtures/purchases-receipt-intake';

const REVIEW_KIND_LABELS: Record<GateFailure['kind'], string> = {
  'unreadable-total': 'The stated total could not be read',
  'unreadable-line': 'A line could not be read',
  'no-lines': 'No lines were read at all',
  'negative-line': 'A line came back negative',
  'sum-mismatch': 'The parts do not sum to the stated total',
  'ambiguous-tax': 'The parts add up two different ways',
  damaged: 'The receipt is damaged or obscured',
};

function itemsLabel(count: number): string {
  return count === 1 ? '1 line item' : `${String(count)} line items`;
}

/**
 * The answer to one upload, told apart rather than flattened.
 *
 * The endpoint distinguishes a reading that agreed with the receipt from one
 * that did not and from a model that read nothing, and a duplicate from a
 * refusal. Each keeps its own panel and its own tone here for the same reason
 * the contract keeps them apart: they ask different things of the reader.
 */
export function OutcomePanel({ submission }: { submission: ReceiptSubmission }) {
  switch (submission.state) {
    case 'idle':
      return null;
    case 'uploading':
      return (
        <p className="text-muted-foreground text-sm">
          Reading the receipt. A model is looking at it, which takes a few seconds.
        </p>
      );
    case 'duplicate':
      return (
        <OutcomeSection tone="neutral" title="Already recorded">
          <p className="text-sm">
            Nothing was recorded again, and nothing went wrong: this receipt is already in the
            system.
          </p>
          {submission.message !== null && (
            <p className="text-muted-foreground text-sm">{submission.message}</p>
          )}
        </OutcomeSection>
      );
    case 'refused':
      return (
        <div className="border-destructive/50 bg-destructive/10 rounded-md border p-4">
          <p className="mb-2 text-sm font-medium">The upload was refused</p>
          <p className="text-muted-foreground text-sm">{submission.message}</p>
        </div>
      );
    case 'created':
      return <CreatedPanel outcome={submission.outcome} />;
    case 'needs-review':
      return <NeedsReviewPanel outcome={submission.outcome} />;
    case 'unreadable':
      return <UnreadablePanel outcome={submission.outcome} />;
  }
}

function CreatedPanel({ outcome }: { outcome: CreatedOutcome }) {
  const { purchase } = outcome;

  return (
    <OutcomeSection tone="recorded" title="Recorded">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Merchant" value={purchase.merchantEntityName ?? 'No merchant named'} />
        <Field label="Total" value={formatCents(purchase.totalCents, purchase.currency)} />
        <Field label="Dated" value={formatDate(purchase.orderedAt)} />
        <Field label="Purchase" value={purchase.id} />
      </dl>

      <p className="text-sm">{itemsLabel(purchase.itemCount)}</p>

      {outcome.alreadyStored && (
        <p className="text-muted-foreground text-sm">
          These exact files were already in the receipt store, kept from an earlier upload that
          recorded no purchase. The bytes were not stored a second time.
        </p>
      )}

      <a href={`#/purchases/${purchase.id}`} className="text-sm underline underline-offset-4">
        Open the order
      </a>
    </OutcomeSection>
  );
}

function NeedsReviewPanel({ outcome }: { outcome: NeedsReviewOutcome }) {
  return (
    <OutcomeSection tone="attention" title="Read, but it does not add up">
      <p className="text-sm">
        Nothing was recorded. Below is what the model read — compare it against the receipt you
        uploaded and settle which of the two is wrong.
      </p>

      <ul aria-label="What the check objected to" className="space-y-2">
        {outcome.failures.map((failure, index) => (
          <li key={`${String(index)}-${failure.kind}`} className="text-sm">
            <p className="font-medium">{REVIEW_KIND_LABELS[failure.kind]}</p>
            <p className="text-muted-foreground">{failure.detail}</p>
            <Delta failure={failure} currency={outcome.extracted.currency} />
          </li>
        ))}
      </ul>

      <ExtractedReading extracted={outcome.extracted} />
      <StoredParts uris={outcome.receiptUris} />
    </OutcomeSection>
  );
}

function Delta({ failure, currency }: { failure: GateFailure; currency: string | null }) {
  const { deltaCents } = failure;
  if (deltaCents === undefined) return null;

  return (
    <p className="font-medium">
      {currency === null || currency.trim() === ''
        ? `The parts miss the stated total by ${String(deltaCents)} cents, in a currency the receipt never states.`
        : `The parts miss the stated total by ${formatCents(deltaCents, currency)}.`}
    </p>
  );
}

function UnreadablePanel({ outcome }: { outcome: UnreadableOutcome }) {
  return (
    <OutcomeSection tone="attention" title="Nothing could be read">
      <p className="text-sm">
        No purchase was created. The upload was kept, so photographing the receipt again and sending
        it does not count as a duplicate.
      </p>
      <dl className="grid grid-cols-1">
        <Field label="Reason" value={outcome.reason} />
      </dl>
      <StoredParts uris={outcome.receiptUris} />
    </OutcomeSection>
  );
}
