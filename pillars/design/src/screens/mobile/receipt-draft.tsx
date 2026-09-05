import { kmartReading, woolworthsFailures, woolworthsReading } from '@/fixtures/receipts';
import { PopsActionBar, PopsButton } from '@/frames/ios/primitives';
import { PopsStatusHeader } from '@/frames/ios/state-views';
import { deltaWording, photoCountLine, RECEIPT_COPY, reviewMessage } from '@/kit/ios-receipt-copy';
import { Identity, Items, PaperHints, Totals } from '@/kit/ios-receipt-draft-form';
import { isSaveable } from '@/kit/ios-receipt-draft-rules';
import { ReceiptPages } from '@/kit/ios-receipt-pages';
import { TriangleAlert } from 'lucide-react';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ExtractedReceipt } from '@/fixtures/receipts';
import type { FieldHints } from '@/kit/ios-receipt-draft-form';
import type { Reconciliation } from '@/kit/ios-receipt-draft-parts';

export const meta: ScreenMeta = { title: 'Receipt draft', order: 11, frame: 'ios' };

const CORRECTION = {
  title: 'Check this receipt',
  subtitle:
    "Everything read off the paper is here and every line can be changed. Rename anything that isn't how you'd say it.",
};

const MANUAL = {
  title: 'Add a purchase',
  subtitle: 'For something with no receipt to photograph. Fill in what you know.',
};

const BLANK: ExtractedReceipt = {
  currency: 'AUD',
  discounts: [],
  surcharges: [],
  lines: [{ id: 'blank', description: '', amount: '' }],
  unreadableNotes: [],
};

const NO_HINTS: string[] = [];

interface DraftProps {
  reading: ExtractedReceipt;
  heading: { title: string; subtitle: string };
  pages?: number;
  status?: string;
  paperHints?: string[];
  fieldHints?: FieldHints;
  reconciliation?: Reconciliation;
  delta?: string;
}

/**
 * The correction surface: a reading laid out as a form without ceasing to be
 * a reading. Merchant at the top, items in a column, the total at the foot —
 * because the reader's job is running this against the paper in their hand,
 * and a column of boxed fields turns that comparison into a settings screen.
 *
 * A hint from the gate is a reason to look, not a reason the form cannot be
 * saved. Only a missing total or a described line with no amount is a
 * problem, and only those two disable Save.
 */
export function ReceiptDraft({
  reading,
  heading,
  pages = 0,
  status,
  paperHints = NO_HINTS,
  fieldHints,
  reconciliation = 'agreed',
  delta,
}: DraftProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 p-4">
        <ReceiptPages count={pages} />
        {status === undefined ? null : (
          <PopsStatusHeader
            tone="warning"
            title={RECEIPT_COPY.reviewTitle}
            message={status}
            caption={photoCountLine(pages)}
            glyph={<TriangleAlert size={30} />}
          />
        )}
        <header className="space-y-2">
          <h1 className="ios-large-title">{heading.title}</h1>
          <p className="ios-body" style={{ color: 'var(--ios-muted-foreground)' }}>
            {heading.subtitle}
          </p>
        </header>
        <PaperHints hints={paperHints} />
        <Identity reading={reading} hints={fieldHints} />
        <Items reading={reading} />
        <Totals reading={reading} reconciliation={reconciliation} delta={delta} />
      </div>
      <PopsActionBar>
        <PopsButton prominence="prominent" disabled={!isSaveable(reading)}>
          Save purchase
        </PopsButton>
        {pages > 0 ? <PopsButton>{RECEIPT_COPY.another}</PopsButton> : null}
      </PopsActionBar>
    </div>
  );
}

export const states: ScreenStates = {
  manual: () => <ReceiptDraft reading={BLANK} heading={MANUAL} reconciliation="changed" />,
  correcting: () => (
    <ReceiptDraft
      reading={woolworthsReading}
      heading={CORRECTION}
      pages={2}
      status={reviewMessage(woolworthsFailures)}
      paperHints={woolworthsReading.unreadableNotes}
      fieldHints={{
        date: { kind: 'hint', text: 'The printed time is smudged — check it against the paper.' },
      }}
      reconciliation="mismatched"
      delta={deltaWording(-250)}
    />
  ),
  edited: () => (
    <ReceiptDraft
      reading={woolworthsReading}
      heading={CORRECTION}
      pages={2}
      reconciliation="changed"
    />
  ),
};

export default function ReceiptDraftScreen() {
  return <ReceiptDraft reading={kmartReading} heading={CORRECTION} pages={1} />;
}
