import { useTranslation } from 'react-i18next';

import { formatCents } from '@pops/ui';

import type { ReactElement } from 'react';

import type { ExplainedSplit as Split } from './explained-split.js';

interface Props {
  split: Split;
  currency: string;
}

/**
 * The explained / unexplained split of one roll-up, rendered whole.
 *
 * Both halves are always on screen, including the unexplained figure when it
 * is zero. Hiding it when there is nothing to report would mean its absence
 * carried two meanings — "all accounted for" and "this view does not show
 * that" — and a reader cannot tell those apart, which is the false certainty
 * ADR-042 refuses one layer down.
 */
export function ExplainedSplit({ split, currency }: Props): ReactElement {
  const { t } = useTranslation('purchases');
  const { explainedCents, residualCents, explainedPercent, hasResidual } = split;
  const explained = formatCents(explainedCents, currency);

  return (
    <div className="space-y-1.5">
      <p className="text-sm">
        <span>
          {explainedPercent === null
            ? t('merchants.split.explainedNoPercent', { amount: explained })
            : t('merchants.split.explained', { amount: explained, percent: explainedPercent })}
        </span>
        <span className="text-muted-foreground px-1.5" aria-hidden="true">
          ·
        </span>
        <span className={hasResidual ? 'text-warning font-medium' : 'text-muted-foreground'}>
          {t('merchants.split.unexplained', {
            amount: formatCents(residualCents, currency),
          })}
        </span>
      </p>

      {explainedPercent !== null && <SplitMeter percent={explainedPercent} />}

      {residualCents < 0 && (
        <p className="text-muted-foreground text-xs">{t('merchants.split.overLinked')}</p>
      )}
    </div>
  );
}

/**
 * A non-zero residual always paints, because `explainedPercent` never reaches
 * 100 while one exists — a one-cent residual is a visible sliver rather than a
 * bar that reads as complete.
 */
function SplitMeter({ percent }: { percent: number }): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <div
      role="meter"
      aria-label={t('merchants.split.meterLabel')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="bg-muted flex h-2 w-full overflow-hidden rounded-full"
    >
      <div className="bg-app-accent" style={{ width: `${percent}%` }} />
      <div className="bg-warning" style={{ width: `${100 - percent}%` }} />
    </div>
  );
}
