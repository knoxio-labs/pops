import type { BalancePoint } from '@/fixtures/account-insights';

/**
 * The twelve-month trend at phone width. A second drawing of the same idea as
 * `kit/sparkline`, not a reuse of it: that one is a web component painted from
 * `@pops/ui` tokens and merged classes, and the phone frame paints from
 * `--ios-*`. It stays hand-drawn SVG for the same reason — one series, no
 * axes, no interaction.
 *
 * The colour is the caller's to set: a liability trending up is not good news
 * and must not be drawn like savings that are.
 */
export function IosSparkline({
  points,
  colour = 'var(--ios-accent)',
}: {
  points: BalancePoint[];
  colour?: string;
}) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 100 / (points.length - 1);
  const coords = values.map((value, i) => `${i * step},${30 - ((value - min) / span) * 27}`);
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${points.length} month trend`}
      className="h-12 w-full"
      style={{ color: colour }}
    >
      <polygon points={`0,30 ${coords.join(' ')} 100,30`} fill="currentColor" opacity="0.14" />
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
