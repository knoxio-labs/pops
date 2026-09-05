import { kmartReading, woolworthsFailures, woolworthsReading } from '@/fixtures/receipts';
import { PopsDivider, PopsTextField } from '@/frames/ios/fields';
import { PopsActionBar, PopsButton } from '@/frames/ios/primitives';
import { PopsStatusHeader } from '@/frames/ios/state-views';
import {
  deltaWording,
  itemCountLine,
  photoCountLine,
  RECEIPT_COPY,
  reviewMessage,
} from '@/kit/ios-receipt-copy';
import { DraftLineRow, DraftSection, ReconciliationNote } from '@/kit/ios-receipt-draft-parts';
import { ReceiptPages } from '@/kit/ios-receipt-pages';
import { TriangleAlert } from 'lucide-react';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ExtractedReceipt } from '@/fixtures/receipts';
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
  lines: [{ description: '', amount: '' }],
  unreadableNotes: [],
};

function Identity({ reading }: { reading: ExtractedReceipt }) {
  return (
    <DraftSection label="Who and when">
      <div className="space-y-4">
        <PopsTextField
          label="Merchant"
          placeholder="Who you bought from"
          value={reading.merchant}
          type="ios-title"
        />
        <PopsTextField
          label="Address"
          placeholder="Where the shop is"
          value={reading.address}
          type="ios-subheadline"
        />
        <PopsTextField
          label="Date"
          placeholder="As printed on the receipt"
          value={[reading.purchasedOn, reading.purchasedAt].filter(Boolean).join(' ') || undefined}
        />
      </div>
    </DraftSection>
  );
}

function Items({ reading }: { reading: ExtractedReceipt }) {
  return (
    <DraftSection label="Items" trailing={itemCountLine(reading.lines.length)}>
      <div className="space-y-4">
        {reading.lines.map((line, index) => (
          <div key={line.description || index} className="space-y-4">
            {index > 0 ? <PopsDivider /> : null}
            <DraftLineRow line={line} />
          </div>
        ))}
        <PopsButton>Add an item</PopsButton>
      </div>
    </DraftSection>
  );
}

function Totals({
  reading,
  reconciliation,
  delta,
}: {
  reading: ExtractedReceipt;
  reconciliation: Reconciliation;
  delta?: string;
}) {
  const rows = [
    reading.tax === undefined ? undefined : { label: 'Tax', value: reading.tax },
    ...reading.discounts.map((value) => ({ label: 'Discounts', value })),
    ...reading.surcharges.map((value) => ({ label: 'Surcharges', value })),
  ].filter((row) => row !== undefined);
  return (
    <DraftSection label="What it came to">
      <div className="space-y-4">
        {rows.map((row) => (
          <PopsTextField
            key={`${row.label}-${row.value}`}
            label={row.label}
            placeholder="0.00"
            value={row.value}
            type="ios-monospaced"
            align="right"
          />
        ))}
        {rows.length === 0 ? null : <PopsDivider />}
        <PopsTextField
          label="Total"
          placeholder="0.00"
          value={reading.total}
          type="ios-amount"
          align="right"
          note={
            reading.total === undefined
              ? { kind: 'problem', text: 'A total is needed before this can be saved.' }
              : undefined
          }
        />
        <ReconciliationNote state={reconciliation} suffix={delta} />
      </div>
    </DraftSection>
  );
}

/**
 * The correction surface: a reading laid out as a form without stopping being
 * a reading. Merchant at the top, items in a column, the total at the foot —
 * because the reader's job is running this against the paper in their hand,
 * and a column of boxed fields turns that comparison into a settings screen.
 *
 * A hint from the gate is a reason to look, not a reason the form cannot be
 * saved; only a missing total or a described line with no amount is a
 * problem, and only those two disable Save.
 */
export function ReceiptDraft({
  reading,
  heading,
  pages = 0,
  status,
  reconciliation = 'agreed',
  delta,
}: {
  reading: ExtractedReceipt;
  heading: { title: string; subtitle: string };
  pages?: number;
  status?: boolean;
  reconciliation?: Reconciliation;
  delta?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 p-4">
        <ReceiptPages count={pages} />
        {status === true ? (
          <PopsStatusHeader
            tone="warning"
            title={RECEIPT_COPY.reviewTitle}
            message={reviewMessage(woolworthsFailures)}
            caption={photoCountLine(pages)}
            glyph={<TriangleAlert size={30} />}
          />
        ) : null}
        <header className="space-y-2">
          <h1 className="ios-large-title">{heading.title}</h1>
          <p className="ios-body" style={{ color: 'var(--ios-muted-foreground)' }}>
            {heading.subtitle}
          </p>
        </header>
        <Identity reading={reading} />
        <Items reading={reading} />
        <Totals reading={reading} reconciliation={reconciliation} delta={delta} />
      </div>
      <PopsActionBar>
        <PopsButton prominence="prominent">Save purchase</PopsButton>
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
      status
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
