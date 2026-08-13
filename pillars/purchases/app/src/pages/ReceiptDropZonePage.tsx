import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { OutcomePanel } from './receipts/OutcomePanel.js';
import { toRequestParts } from './receipts/parts.js';
import { ReceiptIntake } from './receipts/ReceiptIntake.js';
import { useReceiptStaging } from './receipts/useReceiptStaging.js';
import { useReceiptUpload } from './receipts/useReceiptUpload.js';

import type { ReactElement } from 'react';

/**
 * `/purchases/receipts` — the way in.
 *
 * `POST /receipts` reads a photographed till slip, a PDF tax invoice or a
 * pasted order confirmation, and answers with one of three materially
 * different outcomes. This page keeps them apart: a reading that disagreed
 * with the receipt's own total wrote nothing, and rendering it as a success
 * would turn a known unknown into a recorded fact.
 */
export function ReceiptDropZonePage(): ReactElement {
  const { t } = useTranslation('purchases');
  const intake = useReceiptStaging();
  const { submission, submit } = useReceiptUpload();

  const isUploading = submission.state === 'uploading';
  const recordedPurchaseId =
    submission.state === 'read' && submission.outcome.kind === 'created'
      ? submission.outcome.purchase.purchase.id
      : null;

  // Once a purchase exists, the parts that produced it are spent: sending them
  // again is the duplicate the server would refuse, and leaving them staged
  // invites the next receipt to be added to this one.
  const { clear } = intake;
  useEffect(() => {
    if (recordedPurchaseId !== null) clear();
  }, [recordedPurchaseId, clear]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={t('receipts.title')} description={t('receipts.intro')} />

      <ReceiptIntake
        intake={intake}
        disabled={isUploading}
        onSubmit={() => submit(toRequestParts(intake.staging.parts))}
      />

      <div aria-live="polite">
        <OutcomePanel submission={submission} />
      </div>
    </div>
  );
}
