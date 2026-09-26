/**
 * The direct place only, with its symbol: for narrow panels where a full
 * path would fold into ellipses. The full path is in the tooltip.
 */
import { cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../shared/icons';
import { placementTrail, targetName } from '../shared/placement-model';

import type { PlacementTarget } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';

const CONCEPT = { location: 'location', container: 'container', 'in-hand': 'inHand' } as const;

/** One place, named. */
export function PlaceName({
  world,
  target,
  className,
}: {
  world: PlacementWorld;
  target: PlacementTarget;
  className?: string;
}) {
  const Icon = INVENTORY_ICONS[CONCEPT[target.kind]];
  const full = placementTrail(world, target)
    .map((segment) => segment.name)
    .join(' › ');
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)} title={full}>
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          target.kind === 'container' ? 'text-app-accent' : 'text-muted-foreground'
        )}
        aria-hidden
      />
      <span className="truncate">{targetName(world, target)}</span>
    </span>
  );
}
