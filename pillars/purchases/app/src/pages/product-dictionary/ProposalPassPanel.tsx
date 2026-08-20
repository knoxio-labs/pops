import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

import type { ProposalOutcome } from './types.js';

interface ProposalPassPanelProps {
  isPending: boolean;
  outcome: ProposalOutcome | null;
  error: string | null;
  onRun: () => void;
}

/** The five figures the pass answers with, in the order it reasons in. */
const OUTCOME_FIELDS: readonly (keyof ProposalOutcome)[] = [
  'scannedLines',
  'observedWordings',
  'proposed',
  'retired',
  'confirmed',
];

/**
 * Running the pass, and reading what it did.
 *
 * Every figure is shown, `retired` included. A pass takes back the unconfirmed
 * entries no line prints any more, so a run can remove a proposal the reader
 * was about to act on, and a panel reporting only what was minted would let
 * that happen invisibly. `confirmed` is the count it was not allowed to touch,
 * which is the same boundary the rest of this page draws.
 */
export function ProposalPassPanel({
  isPending,
  outcome,
  error,
  onRun,
}: ProposalPassPanelProps): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <section
      aria-label={t('products.pass.title')}
      className="border-border space-y-3 rounded-md border p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">{t('products.pass.title')}</h2>
        <Button size="sm" disabled={isPending} onClick={onRun}>
          {t(isPending ? 'products.pass.running' : 'products.pass.run')}
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">{t('products.pass.explain')}</p>

      <div aria-live="polite">
        {error !== null && (
          <p className="text-destructive text-sm">{t('products.pass.error', { message: error })}</p>
        )}
        {outcome !== null && error === null && (
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {OUTCOME_FIELDS.map((field) => (
              <div key={field}>
                <dt className="text-muted-foreground text-xs">
                  {t(`products.pass.outcome.${field}`)}
                </dt>
                <dd className="text-sm tabular-nums">{outcome[field]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
