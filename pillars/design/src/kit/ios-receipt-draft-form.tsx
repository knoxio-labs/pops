import { PopsDivider, PopsTextField } from '@/frames/ios/fields';
import { PopsButton } from '@/frames/ios/primitives';
import { itemCountLine } from '@/kit/ios-receipt-copy';
import { DraftLineRow, DraftSection, ReconciliationNote } from '@/kit/ios-receipt-draft-parts';
import { adjustmentRows, lineProblem } from '@/kit/ios-receipt-draft-rules';
import { TriangleAlert } from 'lucide-react';

import type { ExtractedReceipt } from '@/fixtures/receipts';
import type { FieldNote } from '@/frames/ios/fields';
import type { Reconciliation } from '@/kit/ios-receipt-draft-parts';

/**
 * The sections a draft form is made of. They are kit rather than screen
 * because the screen's contribution is the order they come in — the pages,
 * then what went wrong, then the reading as a form — and that order is the
 * design under review.
 */

/** A gate complaint that names a field. Never blocks a save: it says "look here". */
export type FieldHints = Partial<Record<'merchant' | 'address' | 'date', FieldNote>>;

/**
 * What the gate said about the paper rather than about a field on it — a torn
 * corner, a code nothing recognises. It sits above the form because there is
 * no field to hang it on, and a complaint with nowhere to go is one a reader
 * never finds.
 */
export function PaperHints({ hints }: { hints: string[] }) {
  if (hints.length === 0) return null;
  return (
    <DraftSection label="About the paper itself">
      <div className="space-y-3">
        {hints.map((hint) => (
          <div key={hint} className="flex gap-3">
            <TriangleAlert
              size={18}
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--ios-warning)' }}
            />
            <p className="ios-body">{hint}</p>
          </div>
        ))}
      </div>
    </DraftSection>
  );
}

export function Identity({ reading, hints }: { reading: ExtractedReceipt; hints?: FieldHints }) {
  const printed = [reading.purchasedOn, reading.purchasedAt].filter(Boolean).join(' ');
  return (
    <DraftSection label="Who and when">
      <div className="space-y-4">
        <PopsTextField
          label="Merchant"
          placeholder="Who you bought from"
          value={reading.merchant}
          type="ios-title"
          note={hints?.merchant}
        />
        <PopsTextField
          label="Address"
          placeholder="Where the shop is"
          value={reading.address}
          type="ios-subheadline"
          note={hints?.address}
        />
        <PopsTextField
          label="Date"
          placeholder="As printed on the receipt"
          value={printed === '' ? undefined : printed}
          note={hints?.date}
        />
      </div>
    </DraftSection>
  );
}

export function Items({ reading }: { reading: ExtractedReceipt }) {
  return (
    <DraftSection label="Items" trailing={itemCountLine(reading.lines.length)}>
      <div className="space-y-4">
        {reading.lines.map((line, index) => (
          <div key={line.id} className="space-y-4">
            {index > 0 ? <PopsDivider /> : null}
            <DraftLineRow
              line={line}
              amountNote={
                lineProblem(line)
                  ? { kind: 'problem', text: 'An amount is needed, or remove the line.' }
                  : undefined
              }
            />
          </div>
        ))}
        <PopsButton>Add an item</PopsButton>
      </div>
    </DraftSection>
  );
}

export function Totals({
  reading,
  reconciliation,
  delta,
}: {
  reading: ExtractedReceipt;
  reconciliation: Reconciliation;
  delta?: string;
}) {
  const rows = adjustmentRows(reading);
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
