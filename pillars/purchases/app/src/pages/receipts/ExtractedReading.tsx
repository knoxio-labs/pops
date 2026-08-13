import { useTranslation } from 'react-i18next';

import { Field } from './OutcomeParts.js';

import type { ReactElement } from 'react';

import type { ExtractedLine, ExtractedReceipt } from './types.js';

/**
 * What the model read, rendered verbatim.
 *
 * Every figure here is the model's own text rather than a parsed amount, and
 * it is shown unformatted on purpose: a reviewer's job is to compare this
 * against the paper, and a total this page tidied into `$41.20` is no longer
 * evidence of what was read.
 */
export function ExtractedReading({ extracted }: { extracted: ExtractedReceipt }): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t('receipts.extracted.heading')}</h3>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t('receipts.extracted.merchant')} value={extracted.merchantName} />
        <Field label={t('receipts.extracted.address')} value={extracted.address} />
        <Field label={t('receipts.extracted.total')} value={extracted.total} />
        <Field label={t('receipts.extracted.currency')} value={extracted.currency} />
        <Field label={t('receipts.extracted.purchasedOn')} value={extracted.purchasedOn} />
        <Field label={t('receipts.extracted.purchasedAt')} value={extracted.purchasedAt} />
        <Field label={t('receipts.extracted.timeZone')} value={extracted.timeZone} />
        <Field label={t('receipts.extracted.tax')} value={extracted.tax} />
        <Field label={t('receipts.extracted.shipping')} value={extracted.shipping} />
        <Field label={t('receipts.extracted.discounts')} value={joined(extracted.discounts)} />
        <Field label={t('receipts.extracted.surcharges')} value={joined(extracted.surcharges)} />
      </dl>

      <div>
        <h4 className="text-sm font-medium">{t('receipts.extracted.linesHeading')}</h4>
        {extracted.lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('receipts.extracted.noLines')}</p>
        ) : (
          <ul aria-label={t('receipts.extracted.linesHeading')} className="divide-y">
            {extracted.lines.map((line, index) => (
              <ReadingLine key={`${String(index)}-${line.description}`} line={line} />
            ))}
          </ul>
        )}
      </div>

      {extracted.unreadable.length > 0 && (
        <div>
          <h4 className="text-sm font-medium">{t('receipts.extracted.unreadableHeading')}</h4>
          <ul aria-label={t('receipts.extracted.unreadableHeading')} className="text-sm">
            {extracted.unreadable.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function joined(values: string[]): string | null {
  return values.length === 0 ? null : values.join(' · ');
}

function ReadingLine({ line }: { line: ExtractedLine }): ReactElement {
  const { t } = useTranslation('purchases');
  const { quantity, unitNote } = line;

  return (
    <li className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="min-w-0">
        {line.description}
        {quantity !== undefined && (
          <span className="text-muted-foreground">
            {' '}
            {t('receipts.extracted.lineQuantity', { quantity })}
          </span>
        )}
        {unitNote !== undefined && <span className="text-muted-foreground"> {unitNote}</span>}
      </span>
      <span className="font-mono">{line.amount}</span>
    </li>
  );
}
