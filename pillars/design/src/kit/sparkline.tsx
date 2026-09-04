import { cn } from '@pops/ui';

import type { BalancePoint } from '@/fixtures/account-insights';

/**
 * A twelve-month trend, drawn small enough to sit inside a card and read at a
 * glance. Hand-drawn SVG rather than a chart library: there is one series, no
 * axes and no interaction, and a dependency would buy none of that back.
 *
 * The line is `currentColor`, so the caller sets the tone — a liability
 * trending up is not good news and should not be drawn in the same colour as
 * savings that are.
 */
export function Sparkline({
  points,
  className,
  filled = true,
}: {
  points: BalancePoint[];
  className?: string;
  filled?: boolean;
}) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 100 / (points.length - 1);
  const coords = values.map((value, i) => `${i * step},${30 - ((value - min) / span) * 28}`);
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${points.length} month trend`}
      className={cn('h-10 w-full text-muted-foreground', className)}
    >
      {filled && (
        <polygon points={`0,30 ${coords.join(' ')} 100,30`} fill="currentColor" opacity="0.12" />
      )}
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** A single proportion — a goal, a credit limit, a card spent down. */
export function ProgressBar({
  fraction,
  className,
}: {
  /** Clamped to 0..1 by the caller's own meaning; over 1 is drawn full. */
  fraction: number;
  className?: string;
}) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full bg-primary', className)}
        style={{ width: `${Math.min(Math.max(fraction, 0), 1) * 100}%` }}
      />
    </div>
  );
}
