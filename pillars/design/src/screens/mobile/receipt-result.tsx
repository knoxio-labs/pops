import { formatBalance } from '@/fixtures/currencies';
import {
  createdPurchase,
  unreadableReason,
  woolworthsFailures,
  woolworthsReading,
} from '@/fixtures/receipts';
import { PopsDivider } from '@/frames/ios/fields';
import { PopsActionBar, PopsButton, PopsCard } from '@/frames/ios/primitives';
import { ErrorStateView, LoadingStateView, PopsStatusHeader } from '@/frames/ios/state-views';
import { itemCountLine, photoCountLine, RECEIPT_COPY, reviewMessage } from '@/kit/ios-receipt-copy';
import { ReceiptPages } from '@/kit/ios-receipt-pages';
import { ReceiptObjections, ReceiptReading } from '@/kit/ios-receipt-reading';
import { transactionDate } from '@/kit/ios-transaction-presentation';
import { CircleCheck, OctagonX, TriangleAlert } from 'lucide-react';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Receipt result', order: 10, frame: 'ios' };

const FAILURE =
  'Receipts are temporarily unreachable. Nothing was recorded — try again in a moment.';

function Outcome({ pages, children }: { pages: number; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 p-4">
        <ReceiptPages count={pages} />
        {children}
      </div>
      <PopsActionBar>
        <PopsButton prominence="prominent">{RECEIPT_COPY.another}</PopsButton>
      </PopsActionBar>
    </div>
  );
}

/**
 * The purchase that was recorded. The total is the largest thing on the card
 * because it is the one figure a reader checks against the paper before
 * putting it in the bin; the reference under it is for the one time in a
 * hundred that check fails.
 */
function Created({ alreadyStored = false }: { alreadyStored?: boolean }) {
  const items = itemCountLine(createdPurchase.itemCount);
  return (
    <Outcome pages={2}>
      <PopsStatusHeader
        tone="success"
        title={RECEIPT_COPY.savedTitle}
        message={alreadyStored ? RECEIPT_COPY.alreadyStored : RECEIPT_COPY.savedMessage}
        glyph={<CircleCheck size={30} />}
      />
      <PopsCard>
        <div className="space-y-3">
          <p className="ios-title">{createdPurchase.merchant}</p>
          <p className="ios-subheadline" style={{ color: 'var(--ios-muted-foreground)' }}>
            Dated {transactionDate(createdPurchase.orderedOn)}
          </p>
          <PopsDivider />
          <div className="flex items-baseline justify-between gap-3">
            <span className="ios-section-label" style={{ color: 'var(--ios-muted-foreground)' }}>
              Total
            </span>
            <span className="ios-amount">
              {formatBalance(createdPurchase.totalMinorUnits, createdPurchase.currency)}
            </span>
          </div>
          {items === undefined ? null : (
            <p className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
              {items}
            </p>
          )}
          <p className="ios-monospaced-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
            Reference {createdPurchase.id}
          </p>
        </div>
      </PopsCard>
    </Outcome>
  );
}

/**
 * Nothing was recorded, and the screen owes the reader two things in order:
 * why not, and what it did manage to read. The objections come first because
 * the reading below them looks plausible — the whole difficulty of this
 * outcome is that a receipt which does not add up still reads like a receipt.
 */
function NeedsReview() {
  return (
    <Outcome pages={2}>
      <PopsStatusHeader
        tone="warning"
        title={RECEIPT_COPY.reviewTitle}
        message={reviewMessage(woolworthsFailures)}
        caption={photoCountLine(2)}
        glyph={<TriangleAlert size={30} />}
      />
      <ReceiptObjections failures={woolworthsFailures} />
      <ReceiptReading reading={woolworthsReading} />
    </Outcome>
  );
}

function Unreadable() {
  return (
    <Outcome pages={1}>
      <PopsStatusHeader
        tone="danger"
        title={RECEIPT_COPY.unreadableTitle}
        message={RECEIPT_COPY.unreadableMessage}
        caption={photoCountLine(1)}
        glyph={<OctagonX size={30} />}
      />
      <PopsCard>
        <p className="ios-body" style={{ color: 'var(--ios-muted-foreground)' }}>
          Details: {unreadableReason}
        </p>
      </PopsCard>
    </Outcome>
  );
}

export const states: ScreenStates = {
  submitting: () => <LoadingStateView message={RECEIPT_COPY.reading} />,
  'gateway-failed': () => <ErrorStateView message={FAILURE} />,
  'needs-review': () => <NeedsReview />,
  unreadable: () => <Unreadable />,
  'already-stored': () => <Created alreadyStored />,
};

export default function ReceiptResultScreen() {
  return <Created />;
}
