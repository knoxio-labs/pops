import { formatCents } from '@pops/ui';

import type { ExplainedSplit } from './explained-split';

/**
 * The explained / unexplained split of one roll-up, rendered whole.
 *
 * Both halves are always on screen, including the unexplained figure when it
 * is zero. Hiding it when there is nothing to report would mean its absence
 * carried two meanings, "all accounted for" and "this view does not show
 * that", and a reader cannot tell those apart.
 */
export function ExplainedSplitView({
  split,
  currency,
}: {
  split: ExplainedSplit;
  currency: string;
}) {
  const { explainedCents, residualCents, explainedPercent, hasResidual } = split;
  const explained = formatCents(explainedCents, currency);

  return (
    <div className="space-y-1.5">
      <p className="text-sm">
        <span>
          {explainedPercent === null
            ? `${explained} explained`
            : `${explained} explained (${explainedPercent}%)`}
        </span>
        <span className="text-muted-foreground px-1.5" aria-hidden="true">
          ·
        </span>
        <span className={hasResidual ? 'text-warning font-medium' : 'text-muted-foreground'}>
          {formatCents(residualCents, currency)} unexplained
        </span>
      </p>

      {explainedPercent !== null && <SplitMeter percent={explainedPercent} />}

      {residualCents < 0 && (
        <p className="text-muted-foreground text-xs">
          More has been linked to these orders than they came to, so no share of the total is
          meaningful.
        </p>
      )}
    </div>
  );
}

/**
 * A non-zero residual always paints, because `explainedPercent` never
 * reaches 100 while one exists: a one-cent residual is a visible sliver
 * rather than a bar that reads as complete.
 */
function SplitMeter({ percent }: { percent: number }) {
  return (
    <div
      role="meter"
      aria-label="Share of spend explained by a matched charge"
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
