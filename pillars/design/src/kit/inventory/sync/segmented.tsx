/**
 * A segmented control on the tabs primitive: one row of choices, each with
 * an optional count, the active one raised. Used for Activity | Sync and
 * for the Sync lists.
 */
import { Tabs, TabsList, TabsTrigger, cn } from '@pops/ui';

/** One segment. `alert` marks a count that asks for attention. */
export interface Segment<T extends string> {
  id: T;
  label: string;
  count?: number;
  alert?: boolean;
}

/** Props for {@link Segmented}. */
export interface SegmentedProps<T extends string> {
  label: string;
  segments: readonly Segment<T>[];
  value: T;
  onChange?: (value: T) => void;
  variant?: 'default' | 'line';
  className?: string;
}

function isSegment<T extends string>(segments: readonly Segment<T>[], raw: string): raw is T {
  return segments.some((segment) => segment.id === raw);
}

/** The control. */
export function Segmented<T extends string>({
  label,
  segments,
  value,
  onChange,
  variant = 'default',
  className,
}: SegmentedProps<T>) {
  return (
    <Tabs
      value={value}
      onValueChange={(raw) => {
        if (isSegment(segments, raw)) onChange?.(raw);
      }}
      className={className}
    >
      <TabsList aria-label={label} variant={variant}>
        {segments.map((segment) => (
          <TabsTrigger key={segment.id} value={segment.id} className="gap-1.5 px-3">
            {segment.label}
            {segment.count === undefined ? null : (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-2xs font-semibold tabular-nums',
                  segment.alert === true && segment.count > 0
                    ? 'bg-warning/20 text-foreground'
                    : 'bg-muted-foreground/15 text-muted-foreground'
                )}
              >
                {segment.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
