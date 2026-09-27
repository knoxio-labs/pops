import { CopySlash } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { StateBanner } from '../../foundation/feedback/state-banner.js';
import { OfflineBanner } from '../../foundation/list-page/list-states.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { placementTrail, samePlacement } from '../../foundation/model/placement-model.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { TypeArrival } from '../../inventory-web/type-arrivals.js';

/** Two loaded rows that may represent the same physical item. */
export interface DuplicatePair {
  name: string;
  place: string;
  ids: [string, string];
}

function displayPlace(world: PlacementWorld, item: ItemRowModel): string {
  return placementTrail(world, item.placement)
    .map((segment) => segment.name)
    .join(' › ');
}

/** Finds the first same-place name pair with exactly one code. */
export function findDuplicatePair(
  rows: readonly ItemRowModel[],
  world: PlacementWorld
): DuplicatePair | null {
  for (let firstIndex = 0; firstIndex < rows.length; firstIndex += 1) {
    const first = rows[firstIndex];
    if (first === undefined) continue;
    const normalizedName = first.name.trim().toLocaleLowerCase();
    for (let secondIndex = firstIndex + 1; secondIndex < rows.length; secondIndex += 1) {
      const second = rows[secondIndex];
      if (second === undefined) continue;
      if (
        normalizedName !== second.name.trim().toLocaleLowerCase() ||
        !samePlacement(first.placement, second.placement) ||
        (first.code === null) === (second.code === null)
      ) {
        continue;
      }
      return {
        name: first.name.trim(),
        place: displayPlace(world, first),
        ids: [first.id, second.id],
      };
    }
  }
  return null;
}

function BannerFrame({
  icon: Icon,
  tone,
  title,
  detail,
  children,
}: {
  icon: LucideIcon;
  tone: 'accent' | 'warning';
  title: string;
  detail: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2',
        tone === 'accent'
          ? 'border-app-accent/40 bg-app-accent/10'
          : 'border-warning/40 bg-warning/10'
      )}
      role="status"
    >
      <Icon
        className={cn('size-4 shrink-0', tone === 'accent' ? 'text-app-accent' : 'text-warning')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1">{children}</span>
    </div>
  );
}

/** Shows a non-destructive duplicate warning with dismiss and compare actions. */
export function DuplicatesBanner({
  name,
  place,
  onDismiss,
  onCompare,
}: {
  name: string;
  place: string;
  onDismiss: () => void;
  onCompare: () => void;
}): ReactElement {
  return (
    <BannerFrame
      icon={CopySlash}
      tone="warning"
      title={`Two items called ${name} sit on ${place}`}
      detail="One has a code and one does not. Open both to decide which to keep."
    >
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
      <Button size="sm" variant="outline" className={cn('bg-background')} onClick={onCompare}>
        Compare both
      </Button>
    </BannerFrame>
  );
}

/** Shows one newly published type whose claimed legacy label has matches. */
export function TypeArrivedBanner({
  typeLabel,
  matches,
  onNotNow,
  onReview,
}: {
  typeLabel: string;
  matches: number;
  onNotNow: () => void;
  onReview: () => void;
}): ReactElement {
  return (
    <BannerFrame
      icon={INVENTORY_ICONS.type}
      tone="accent"
      title={`${matches} ${matches === 1 ? 'untyped item looks like' : 'untyped items look like'} ${typeLabel}`}
      detail={`${typeLabel} was published. Review them before anything changes.`}
    >
      <Button size="sm" variant="ghost" onClick={onNotNow}>
        Not now
      </Button>
      <Button size="sm" variant="outline" className={cn('bg-background')} onClick={onReview}>
        Review {matches}
      </Button>
    </BannerFrame>
  );
}

interface ItemsBannerProps {
  online: boolean;
  changed: {
    groups: readonly { entityCount: number }[];
    stale: boolean;
    reload: () => Promise<void>;
  };
  duplicate: DuplicatePair | null;
  arrival: TypeArrival | null;
  onDismiss: () => void;
  onCompare: (name: string) => void;
  onDismissArrival: () => void;
  onReviewArrival: () => void;
}

/** Chooses the first applicable offline, stale, duplicate, or Type arrived banner. */
export function ItemsBanner({
  online,
  changed,
  duplicate,
  arrival,
  onDismiss,
  onCompare,
  onDismissArrival,
  onReviewArrival,
}: ItemsBannerProps): ReactElement | null {
  if (!online) return <OfflineBanner />;
  if (changed.stale) {
    const count = changed.groups.reduce((sum, group) => sum + group.entityCount, 0);
    return (
      <StateBanner
        kind="stale"
        title={`${count} ${count === 1 ? 'item' : 'items'} changed elsewhere since this list loaded`}
        detail="The list stays as it is while you select. Reload to see the changes."
        actionLabel="Reload"
        onAction={() => void changed.reload()}
      />
    );
  }
  if (duplicate !== null) {
    return (
      <DuplicatesBanner
        name={duplicate.name}
        place={duplicate.place}
        onDismiss={onDismiss}
        onCompare={() => onCompare(duplicate.name)}
      />
    );
  }
  if (arrival === null) return null;
  return (
    <TypeArrivedBanner
      typeLabel={arrival.type.label}
      matches={arrival.matches}
      onNotNow={onDismissArrival}
      onReview={onReviewArrival}
    />
  );
}
