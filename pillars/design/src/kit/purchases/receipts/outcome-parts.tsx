import { Fact } from '@/kit/purchases/fact';
import { useId } from 'react';

import type { ReactNode } from 'react';

/**
 * How loudly one outcome should read.
 *
 * `attention` exists so a receipt that was read but did not add up cannot be
 * dressed as a recorded one — nothing was written, and a green panel saying
 * otherwise is the failure this whole outcome union is shaped to avoid.
 */
export type OutcomeTone = 'recorded' | 'attention' | 'refused' | 'neutral';

const TONES: Readonly<Record<OutcomeTone, string>> = {
  recorded: 'border-success/50 bg-success/5',
  attention: 'border-warning/60 bg-warning/10',
  refused: 'border-destructive/50 bg-destructive/10',
  neutral: 'border-border bg-muted/30',
};

export function OutcomeSection({
  tone,
  title,
  children,
}: {
  tone: OutcomeTone;
  title: string;
  children: ReactNode;
}) {
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

/**
 * One labelled reading of the model's. Every absence on this panel means the
 * same thing — the model did not read it — so the wording is fixed here
 * rather than asked of each caller.
 */
export function Field({ label, value }: { label: string; value: string | null }) {
  return <Fact label={label} value={value} missingLabel="Not read" />;
}

/**
 * Where the uploaded bytes ended up. Kept on screen for the two outcomes that
 * write no purchase, because the store is then the only trace of the upload.
 */
export function StoredParts({ uris }: { uris: readonly string[] }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">Stored as</p>
      <ul aria-label="Stored receipt parts" className="text-xs">
        {uris.map((uri) => (
          <li key={uri} className="font-mono break-all">
            {uri}
          </li>
        ))}
      </ul>
    </div>
  );
}
