import {
  CREATED_SUBMISSION,
  DUPLICATE_SUBMISSION,
  NEEDS_REVIEW_SUBMISSION,
  REFUSED_SUBMISSION,
  STAGED_PARTS,
  STAGING_PROBLEMS,
  UNREADABLE_SUBMISSION,
  type ReceiptSubmission,
} from '@/fixtures/purchases-receipt-intake';
import { OutcomePanel } from '@/kit/purchases/receipts/outcome-panel';
import { ReceiptIntake } from '@/kit/purchases/receipts/receipt-intake';
import { EMPTY_STAGING, type Staging } from '@/kit/purchases/receipts/staging';
import { useReceiptStaging } from '@/kit/purchases/receipts/use-receipt-staging';

import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Receipt drop zone', order: 3, frame: 'web' };

const IDLE_SUBMISSION: ReceiptSubmission = { state: 'idle' };

/**
 * `/purchases/receipts` — the way in.
 *
 * `POST /receipts` reads a photographed till slip, a PDF tax invoice or a
 * pasted order confirmation, and answers three materially different ways.
 * The three stay three: a reading that disagreed with the receipt's own
 * total wrote nothing, and rendering it as a success would turn a known
 * unknown into a recorded fact. The states below add the two the transport
 * contributes — an upload in flight, and one the pillar refused outright —
 * and the 409 that is not an error but an answer.
 */
export function ReceiptDropZonePage({
  initialStaging = EMPTY_STAGING,
  submission = IDLE_SUBMISSION,
}: {
  initialStaging?: Staging;
  submission?: ReceiptSubmission;
}) {
  const intake = useReceiptStaging(initialStaging);
  const isUploading = submission.state === 'uploading';

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Add a receipt"
        description="Photograph a till slip, upload a PDF tax invoice, or paste the text of an order confirmation. Every reading is checked against the total the receipt states before anything is recorded."
      />

      <ReceiptIntake intake={intake} disabled={isUploading} onSubmit={() => undefined} />

      {/*
        The one live region on this surface, and deliberately on the wrapper
        rather than on each outcome: a live region nested inside another
        announces unpredictably in several screen readers, and only the
        wrapper reaches every outcome rather than a couple of them.
      */}
      <div aria-live="polite">
        <OutcomePanel submission={submission} />
      </div>
    </div>
  );
}

export const states: ScreenStates = {
  staged: () => <ReceiptDropZonePage initialStaging={{ parts: STAGED_PARTS, problems: [] }} />,
  uploading: () => (
    <ReceiptDropZonePage
      initialStaging={{ parts: STAGED_PARTS, problems: [] }}
      submission={{ state: 'uploading' }}
    />
  ),
  created: () => <ReceiptDropZonePage submission={CREATED_SUBMISSION} />,
  duplicate: () => <ReceiptDropZonePage submission={DUPLICATE_SUBMISSION} />,
  'needs-review': () => <ReceiptDropZonePage submission={NEEDS_REVIEW_SUBMISSION} />,
  unreadable: () => <ReceiptDropZonePage submission={UNREADABLE_SUBMISSION} />,
  refused: () => <ReceiptDropZonePage submission={REFUSED_SUBMISSION} />,
  'staging-problem': () => (
    <ReceiptDropZonePage initialStaging={{ parts: [], problems: STAGING_PROBLEMS }} />
  ),
};

export default function ReceiptDropZoneScreen() {
  return <ReceiptDropZonePage />;
}
