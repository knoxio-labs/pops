import { cn } from '../lib/utils';

/** One point on a sparkline: an x position implied by order, and a value. */
export interface SparklinePoint {
  /** Labels the point for assistive technology — a month, a date, a bucket name. */
  label: string;
  value: number;
}

/**
 * A small trend line, drawn to sit inside a card and read at a glance.
 *
 * Hand-drawn SVG rather than a chart library: there is one series, no axes and
 * no interaction, and a dependency would buy none of that back.
 *
 * The stroke is `currentColor`, so the caller sets the tone. That matters for
 * money — a liability trending upward is not good news and must not be drawn
 * in the same colour as savings that are.
 *
 * Fewer than two points renders nothing at all rather than a flat line or a
 * placeholder: one reading is not a trend, and drawing it as one would be a
 * claim the data does not support.
 */
export function Sparkline({
  points,
  className,
  filled = true,
  label,
}: {
  points: SparklinePoint[];
  className?: string;
  /** Shade under the line. Off for a dense grid where the fill would muddy. */
  filled?: boolean;
  /** Accessible name. Defaults to naming the span the points cover. */
  label?: string;
}) {
  if (points.length < 2) return null;

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series has no span to scale against; 1 keeps it on the baseline
  // rather than dividing by zero.
  const span = max - min || 1;
  const step = 100 / (points.length - 1);
  const coords = values.map(
    (value, index) => `${index * step},${30 - ((value - min) / span) * 28}`
  );

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      role="img"
      aria-label={label ?? `Trend from ${points[0]?.label} to ${points.at(-1)?.label}`}
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
