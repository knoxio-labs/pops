import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import type { ReactElement, ReactNode } from 'react';

/**
 * How loudly one outcome should read.
 *
 * `attention` exists so a receipt that was read but did not add up cannot be
 * dressed as a recorded one — nothing was written, and a green panel saying
 * otherwise is the failure this whole union was shaped to avoid.
 */
export type OutcomeTone = 'recorded' | 'attention' | 'refused' | 'neutral';

const TONES: Readonly<Record<OutcomeTone, string>> = {
  recorded: 'border-emerald-500/50 bg-emerald-500/5',
  attention: 'border-amber-500/60 bg-amber-500/10',
  refused: 'border-destructive/50 bg-destructive/10',
  neutral: 'border-border bg-muted/30',
};

export interface OutcomeSectionProps {
  tone: OutcomeTone;
  title: string;
  children: ReactNode;
}

export function OutcomeSection({ tone, title, children }: OutcomeSectionProps): ReactElement {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`space-y-3 rounded-md border p-4 ${TONES[tone]}`}
    >
      <h2 id={headingId} className="text-base font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

export interface FieldProps {
  label: string;
  value: string | null;
}

/** One labelled reading, saying "not read" rather than rendering a blank. */
export function Field({ label, value }: FieldProps): ReactElement {
  const { t } = useTranslation('purchases');
  const missing = value === null || value.trim() === '';
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={missing ? 'text-muted-foreground text-sm italic' : 'text-sm'}>
        {missing ? t('receipts.extracted.missing') : value}
      </dd>
    </div>
  );
}

/**
 * Where the uploaded bytes ended up. Kept on screen for the two outcomes that
 * write no purchase, because the store is then the only trace of the upload.
 */
export function StoredParts({ uris }: { uris: string[] }): ReactElement {
  const { t } = useTranslation('purchases');
  return (
    <div>
      <p className="text-muted-foreground text-xs">{t('receipts.stored.heading')}</p>
      <ul aria-label={t('receipts.stored.ariaLabel')} className="text-xs">
        {uris.map((uri) => (
          <li key={uri} className="font-mono break-all">
            {uri}
          </li>
        ))}
      </ul>
    </div>
  );
}
