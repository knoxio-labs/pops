import { Field } from './outcome-parts';

import type { ExtractedLine, ExtractedReceipt } from '@/fixtures/purchases-receipt-intake';

function joined(values: readonly string[]): string | null {
  return values.length === 0 ? null : values.join(' · ');
}

/**
 * What the model read, rendered verbatim.
 *
 * Every figure here is the model's own text rather than a parsed amount, and
 * it is shown unformatted on purpose: a reviewer's job is to compare this
 * against the paper, and a total this page tidied into `$41.20` is no longer
 * evidence of what was read.
 */
export function ExtractedReading({ extracted }: { extracted: ExtractedReceipt }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">What the model read</h3>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Merchant" value={extracted.merchantName} />
        <Field label="Address" value={extracted.address} />
        <Field label="Stated total" value={extracted.total} />
        <Field label="Currency" value={extracted.currency} />
        <Field label="Date" value={extracted.purchasedOn} />
        <Field label="Timestamp" value={extracted.purchasedAt} />
        <Field label="Time zone" value={extracted.timeZone} />
        <Field label="Tax" value={extracted.tax} />
        <Field label="Shipping" value={extracted.shipping} />
        <Field label="Discounts" value={joined(extracted.discounts)} />
        <Field label="Surcharges" value={joined(extracted.surcharges)} />
      </dl>

      <div>
        <h4 className="text-sm font-medium">Lines</h4>
        {extracted.lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">The reading has no lines.</p>
        ) : (
          <ul aria-label="Lines" className="divide-y">
            {extracted.lines.map((line, index) => (
              <ReadingLine key={`${String(index)}-${line.description}`} line={line} />
            ))}
          </ul>
        )}
      </div>

      {extracted.unreadable.length > 0 && (
        <div>
          <h4 className="text-sm font-medium">What the model could not make out</h4>
          <ul aria-label="What the model could not make out" className="text-sm">
            {extracted.unreadable.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReadingLine({ line }: { line: ExtractedLine }) {
  const { quantity, unitNote } = line;

  return (
    <li className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="min-w-0">
        {line.description}
        {quantity !== undefined && <span className="text-muted-foreground"> × {quantity}</span>}
        {unitNote !== undefined && <span className="text-muted-foreground"> {unitNote}</span>}
      </span>
      <span className="font-mono">{line.amount}</span>
    </li>
  );
}
