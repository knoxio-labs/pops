import { useTranslation } from 'react-i18next';

import { formatDate } from '@pops/ui';

import { formatCents } from '../../money.js';
import { ExtractedReading } from './ExtractedReading.js';
import { Field, OutcomeSection, StoredParts } from './OutcomeParts.js';

import type { ReactElement } from 'react';

import type {
  CreatedOutcome,
  GateFailure,
  NeedsReviewOutcome,
  UnreadableOutcome,
} from './types.js';
import type { ReceiptSubmission } from './useReceiptUpload.js';

/**
 * The answer to one upload, told apart rather than flattened.
 *
 * The endpoint distinguishes a reading that agreed with the receipt from one
 * that did not and from a model that read nothing, and a duplicate from a
 * refusal. Each keeps its own panel and its own tone here for the same reason
 * the contract keeps them apart: they ask different things of the reader.
 */
export function OutcomePanel({
  submission,
}: {
  submission: ReceiptSubmission;
}): ReactElement | null {
  const { t } = useTranslation('purchases');

  switch (submission.state) {
    case 'idle':
      return null;

    case 'uploading':
      return <p className="text-muted-foreground text-sm">{t('receipts.status.uploading')}</p>;

    case 'duplicate':
      return (
        <OutcomeSection tone="neutral" title={t('receipts.duplicate.title')}>
          <p className="text-sm">{t('receipts.duplicate.intro')}</p>
          {submission.message !== null && (
            <p className="text-muted-foreground text-sm">{submission.message}</p>
          )}
        </OutcomeSection>
      );

    case 'refused':
      return (
        <div className="border-destructive/50 bg-destructive/10 rounded-md border p-4">
          <p className="mb-2 text-sm font-medium">{t('receipts.refused.title')}</p>
          <p className="text-muted-foreground text-sm">{submission.failure.message}</p>
        </div>
      );

    case 'read':
      switch (submission.outcome.kind) {
        case 'created':
          return <CreatedPanel outcome={submission.outcome} />;
        case 'needs-review':
          return <NeedsReviewPanel outcome={submission.outcome} />;
        case 'unreadable':
          return <UnreadablePanel outcome={submission.outcome} />;
      }
  }
}

function CreatedPanel({ outcome }: { outcome: CreatedOutcome }): ReactElement {
  const { t } = useTranslation('purchases');
  const { purchase, items } = outcome.purchase;

  return (
    <OutcomeSection tone="recorded" title={t('receipts.created.title')}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field
          label={t('receipts.created.merchant')}
          value={purchase.merchantEntityName ?? t('receipts.created.unnamedMerchant')}
        />
        <Field
          label={t('receipts.created.total')}
          value={formatCents(purchase.totalCents, purchase.currency)}
        />
        <Field label={t('receipts.created.orderedAt')} value={formatDate(purchase.orderedAt)} />
        <Field label={t('receipts.created.id')} value={purchase.id} />
      </dl>

      <p className="text-sm">{t('receipts.created.items', { count: items.length })}</p>

      {outcome.alreadyStored && (
        <p className="text-muted-foreground text-sm">{t('receipts.created.alreadyStored')}</p>
      )}

      <p className="text-muted-foreground text-xs">{t('receipts.created.noDetailView')}</p>
    </OutcomeSection>
  );
}

function NeedsReviewPanel({ outcome }: { outcome: NeedsReviewOutcome }): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <OutcomeSection tone="attention" title={t('receipts.review.title')}>
      <p className="text-sm">{t('receipts.review.intro')}</p>

      <ul aria-label={t('receipts.review.failuresLabel')} className="space-y-2">
        {outcome.failures.map((failure, index) => (
          <li key={`${String(index)}-${failure.kind}`} className="text-sm">
            <p className="font-medium">{t(`receipts.review.kind.${failure.kind}`)}</p>
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

/**
 * How far the receipt's own parts fall from the total it states.
 *
 * Reported in the receipt's currency when it named one, and in bare cents when
 * it did not — rather than picking a currency for it, which would put a figure
 * on screen the receipt never carried.
 */
function Delta({
  failure,
  currency,
}: {
  failure: GateFailure;
  currency: string | null;
}): ReactElement | null {
  const { t } = useTranslation('purchases');
  const { deltaCents } = failure;
  if (deltaCents === undefined) return null;

  return (
    <p className="font-medium">
      {currency === null || currency.trim() === ''
        ? t('receipts.review.deltaCents', { cents: deltaCents })
        : t('receipts.review.delta', { amount: formatCents(deltaCents, currency) })}
    </p>
  );
}

function UnreadablePanel({ outcome }: { outcome: UnreadableOutcome }): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <OutcomeSection tone="attention" title={t('receipts.unreadable.title')}>
      <p className="text-sm">{t('receipts.unreadable.intro')}</p>
      <dl className="grid grid-cols-1">
        <Field label={t('receipts.unreadable.reason')} value={outcome.reason} />
      </dl>
      <StoredParts uris={outcome.receiptUris} />
    </OutcomeSection>
  );
}
