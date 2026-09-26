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

function Count({ count, alert }: { count: number; alert: boolean }) {
  return (
    <span
      className={cn(
        'tabular-nums',
        alert && count > 0
          ? 'min-w-5 rounded-full bg-warning/20 px-1.5 text-2xs font-semibold text-foreground'
          : 'text-xs text-muted-foreground'
      )}
    >
      {count}
    </span>
  );
}

/** Renders a generic count-aware segmented control on the shared tabs primitive. */
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
      className={cn('self-start', className)}
    >
      <TabsList aria-label={label} variant={variant}>
        {segments.map((segment) => (
          <TabsTrigger key={segment.id} value={segment.id} className="flex-none gap-1.5 px-3">
            {segment.label}
            {segment.count === undefined ? null : (
              <Count count={segment.count} alert={segment.alert === true} />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
