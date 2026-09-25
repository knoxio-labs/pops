/**
 * Where something is, as one line: places, then the containers it sits in,
 * each container marked so "in the kitchen" and "in a box in the kitchen"
 * never read the same. Long paths fold in the middle and keep the full path
 * in the tooltip. Distinct from `LocationBreadcrumb`, which knows nothing of
 * containers or in hand.
 */
import { ChevronRight } from 'lucide-react';

import { cn } from '@pops/ui';

import { INVENTORY_ICONS } from './icons';
import { placementTrail, previousTrail } from './placement-model';

import type { InventoryConcept } from './icons';
import type { Placement, PreviousPlacement } from './model';
import type { PathSegment, PlacementWorld } from './placement-model';

/** Props for {@link PlacementPath}. */
export interface PlacementPathProps {
  world: PlacementWorld;
  /** The current placement, or a remembered previous one. */
  placement: Placement | PreviousPlacement;
  /** Segments shown before the middle folds. At least 2. */
  maxSegments?: number;
  className?: string;
}

const ELLIPSIS: PathSegment = { kind: 'missing', id: '…', name: '…' };

/**
 * The segments to draw: a leading property (the house) is implied whenever
 * something follows it, and anything longer than `max` folds after its first
 * segment. The tooltip always carries the whole path.
 */
export function visibleSegments(
  trail: readonly PathSegment[],
  max: number,
  isProperty: (id: string) => boolean
): PathSegment[] {
  const first = trail[0];
  const trimmed =
    trail.length > 1 && first?.kind === 'location' && first.id !== null && isProperty(first.id)
      ? trail.slice(1)
      : [...trail];
  const limit = Math.max(2, max);
  if (trimmed.length <= limit) return trimmed;
  return [trimmed[0] ?? ELLIPSIS, ELLIPSIS, ...trimmed.slice(trimmed.length - (limit - 1))];
}

const SEGMENT_CONCEPT: Readonly<Record<PathSegment['kind'], InventoryConcept | null>> = {
  location: 'location',
  container: 'container',
  'in-hand': 'inHand',
  deleted: 'location',
  missing: null,
};

function SegmentIcon({ segment }: { segment: PathSegment }) {
  const concept = SEGMENT_CONCEPT[segment.kind];
  if (concept === null) return null;
  const Icon = INVENTORY_ICONS[concept];
  const tone = segment.kind === 'container' ? 'text-app-accent' : 'text-muted-foreground';
  return <Icon className={cn('size-3.5 shrink-0', tone)} aria-hidden />;
}

function Segment({
  segment,
  first,
  last,
}: {
  segment: PathSegment;
  first: boolean;
  last: boolean;
}) {
  const showIcon = segment.kind !== 'location' || first;
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1',
        last ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      {showIcon ? <SegmentIcon segment={segment} /> : null}
      <span className={cn('truncate', segment.kind === 'deleted' && 'line-through')}>
        {segment.name}
      </span>
      {segment.kind === 'deleted' ? (
        <span className="shrink-0 text-muted-foreground">(deleted)</span>
      ) : null}
    </span>
  );
}

/** One-line placement path. */
export function PlacementPath({
  world,
  placement,
  maxSegments = 3,
  className,
}: PlacementPathProps) {
  const trail =
    placement.kind === 'deleted'
      ? previousTrail(world, placement)
      : placementTrail(world, placement);
  const isProperty = (id: string): boolean => world.locations.get(id)?.kind === 'property';
  const shown = visibleSegments(trail, maxSegments, isProperty);
  const full = trail.map((segment) => segment.name).join(' › ');
  return (
    <span
      className={cn('relative inline-flex min-w-0 items-center gap-1 text-xs', className)}
      title={full}
    >
      <span className="sr-only">{full}</span>
      <span aria-hidden className="inline-flex min-w-0 items-center gap-1">
        {shown.map((segment, index) => (
          <span
            key={`${segment.kind}-${segment.id ?? segment.name}`}
            className="inline-flex min-w-0 items-center gap-1"
          >
            {index > 0 ? (
              <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
            ) : null}
            <Segment segment={segment} first={index === 0} last={index === shown.length - 1} />
          </span>
        ))}
      </span>
    </span>
  );
}
