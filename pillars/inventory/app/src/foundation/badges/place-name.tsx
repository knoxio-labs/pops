/** The direct place with its symbol; the full placement path is in the tooltip. */
import { cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons';
import { placementTrail, targetName } from '../model/placement-model';

import type { ReactElement } from 'react';

import type { PlacementTarget } from '../model/model';
import type { PlacementWorld } from '../model/placement-model';

const CONCEPT = { location: 'location', container: 'container', 'in-hand': 'inHand' } as const;

/** Renders a target's direct name and icon while retaining its full path as a tooltip. */
export function PlaceName({
  world,
  target,
  className,
}: {
  world: PlacementWorld;
  target: PlacementTarget;
  className?: string;
}): ReactElement {
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
