import { PopsDivider } from '@/frames/ios/fields';
import { PopsCard } from '@/frames/ios/primitives';
import { IosSectionHeader } from '@/kit/ios-controls';
import { deltaWording, GATE_LABEL, lineQualifier, RECEIPT_COPY } from '@/kit/ios-receipt-copy';
import { adjustmentRows } from '@/kit/ios-receipt-draft-rules';
import { TriangleAlert } from 'lucide-react';

import type { ExtractedReceipt, GateFailure, ReceiptLine } from '@/fixtures/receipts';

/**
 * The reading, laid out as the paper is: who and when at the top, the items
 * in a column, the adjustments and the total at the foot. Amounts are the
 * printed strings the extractor read, unformatted and unsigned — the reader's
 * job here is running this against the receipt in their hand, and a figure
 * re-rendered into the device's own currency style is one they then have to
 * translate back.
 */
export function ReceiptLineRow({ line }: { line: ReceiptLine }) {
  const qualifier = lineQualifier(line.quantity, line.unitNote);
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="ios-body">{line.description}</p>
        {qualifier === undefined ? null : (
          <p className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
            {qualifier}
          </p>
        )}
      </div>
      <span className="ios-monospaced shrink-0">{line.amount}</span>
    </div>
  );
}

function Figure({
  label,
  value,
  total = false,
}: {
  label: string;
  value: string;
  total?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={total ? 'ios-headline' : 'ios-subheadline'}
        style={{ color: total ? 'var(--ios-foreground)' : 'var(--ios-muted-foreground)' }}
      >
        {label}
      </span>
      <span
        className="ios-monospaced"
        style={{ color: total ? 'var(--ios-foreground)' : 'var(--ios-muted-foreground)' }}
      >
        {value}
      </span>
    </div>
  );
}

function Identity({ reading }: { reading: ExtractedReceipt }) {
  const stamp = [reading.purchasedOn, reading.purchasedAt].filter(Boolean).join(' ');
  return (
    <div className="space-y-1">
      {reading.merchant === undefined ? null : <p className="ios-title">{reading.merchant}</p>}
      {reading.address === undefined ? null : (
        <p className="ios-subheadline" style={{ color: 'var(--ios-muted-foreground)' }}>
          {reading.address}
        </p>
      )}
      {stamp === '' ? null : (
        <p className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
          {stamp}
        </p>
      )}
    </div>
  );
}

export function ReceiptReading({ reading }: { reading: ExtractedReceipt }) {
  const rows = adjustmentRows(reading);
  return (
    <section className="space-y-2">
      <IosSectionHeader>{RECEIPT_COPY.whatRead}</IosSectionHeader>
      <PopsCard>
        <div className="space-y-3">
          <Identity reading={reading} />
          <PopsDivider />
          <div className="space-y-3">
            {reading.lines.map((line) => (
              <ReceiptLineRow key={line.id} line={line} />
            ))}
          </div>
          <PopsDivider />
          <div className="space-y-2">
            {rows.map((row) => (
              <Figure key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
            {reading.total === undefined ? null : (
              <Figure label="Total" value={reading.total} total />
            )}
          </div>
          {reading.unreadableNotes.length === 0 ? null : (
            <>
              <PopsDivider />
              <div className="space-y-1">
                <p className="ios-section-label" style={{ color: 'var(--ios-muted-foreground)' }}>
                  {RECEIPT_COPY.couldNotRead}
                </p>
                <p className="ios-body">{reading.unreadableNotes.join(' ')}</p>
              </div>
            </>
          )}
        </div>
      </PopsCard>
    </section>
  );
}

/** Each thing the gate objected to: what it was, and what it saw. */
export function ReceiptObjections({ failures }: { failures: GateFailure[] }) {
  if (failures.length === 0) return null;
  return (
    <section className="space-y-2">
      <IosSectionHeader>{RECEIPT_COPY.whyReview}</IosSectionHeader>
      <PopsCard>
        <div className="space-y-3">
          {failures.map((failure) => (
            <div key={failure.kind} className="flex gap-3">
              <TriangleAlert
                size={18}
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--ios-warning)' }}
              />
              <div className="min-w-0 space-y-0.5">
                <p className="ios-body font-semibold">{GATE_LABEL[failure.kind]}</p>
                <p className="ios-subheadline" style={{ color: 'var(--ios-muted-foreground)' }}>
                  {failure.detail}
                  {failure.deltaCents === undefined ? '' : ` — ${deltaWording(failure.deltaCents)}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      </PopsCard>
    </section>
  );
}
