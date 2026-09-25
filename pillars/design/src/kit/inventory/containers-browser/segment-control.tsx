/**
 * The Containers segments as one radio group, each with its count, so the
 * number of open boxes is visible before anyone clicks Open. Moving day is
 * every active container in packing order, so it carries no count of its own.
 */
import { ButtonPrimitive, cn } from '@pops/ui';

import { SEGMENTS } from './containers-model';

import type { ContainerSegment } from './containers-model';

const LABELS: Readonly<Record<ContainerSegment, string>> = {
  all: 'All',
  open: 'Open',
  closed: 'Closed',
  full: 'Full',
  moving: 'Moving day',
  retired: 'Retired',
};

/** The segment control. */
export function SegmentControl({
  value,
  counts,
  onChange,
}: {
  value: ContainerSegment;
  counts: Readonly<Record<ContainerSegment, number>>;
  onChange?: (segment: ContainerSegment) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Show"
      className="flex items-center gap-0.5 rounded-lg bg-muted p-1"
    >
      {SEGMENTS.map((segment) => (
        <ButtonPrimitive
          key={segment}
          role="radio"
          aria-checked={value === segment}
          variant="ghost"
          size="xs"
          className={cn(
            'h-7 gap-1.5 px-2.5 text-xs',
            value === segment
              ? 'bg-background text-foreground shadow-sm hover:bg-background'
              : 'text-muted-foreground'
          )}
          onClick={() => onChange?.(segment)}
        >
          {LABELS[segment]}
          {segment === 'moving' ? null : (
            <span className="tabular-nums text-muted-foreground">{counts[segment]}</span>
          )}
        </ButtonPrimitive>
      ))}
    </div>
  );
}
