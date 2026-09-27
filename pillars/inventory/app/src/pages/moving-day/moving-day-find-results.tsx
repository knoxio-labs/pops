import { SearchX } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { QuantityBadge } from '../../foundation/badges/badges.js';
import { MovingDayBoxCard } from './moving-day-box-card.js';
import { findInBoxes, matchCount } from './moving-day-search.js';

import type { MovingDayBoardProps } from './moving-day-board-types.js';

function MatchCard({
  match,
  world,
  selectedId,
  pendingIds,
  disabledReason,
  rejections,
  onAction,
  onOpenBox,
}: {
  readonly match: ReturnType<typeof findInBoxes>[number];
  readonly world: MovingDayBoardProps['world'];
  readonly selectedId: string | null;
  readonly pendingIds: ReadonlySet<string>;
  readonly disabledReason: string | undefined;
  readonly rejections: Readonly<Record<string, string>>;
  readonly onAction: MovingDayBoardProps['onAction'];
  readonly onOpenBox: MovingDayBoardProps['onOpenBox'];
}) {
  return (
    <li className="space-y-1.5 rounded-xl border bg-muted/40 p-2">
      <ul>
        <MovingDayBoxCard
          box={match.box}
          world={world}
          selected={selectedId === match.box.id}
          pending={pendingIds.has(match.box.id)}
          disabledReason={disabledReason}
          rejection={rejections[match.box.id]}
          onAction={(action) => onAction(match.box, action)}
          onOpen={() => onOpenBox(match.box.id)}
        />
      </ul>
      <ul aria-label={`Matches in ${match.box.name}`} className="space-y-0.5 px-1">
        {match.items.map((item) => (
          <li key={item.id} className="flex min-h-8 items-center gap-2 rounded-md px-2 text-sm">
            <span className="truncate">{item.name}</span>
            <QuantityBadge quantity={item.quantity} />
          </li>
        ))}
      </ul>
    </li>
  );
}

/** Renders search results with matched contents beneath each matching box. */
export function FindResults({
  data,
  world,
  query,
  selectedId,
  pendingIds,
  disabledReason,
  rejections,
  onAction,
  onClear,
  onOpenBox,
}: MovingDayBoardProps & { readonly onClear: () => void }) {
  const matches = findInBoxes(data.boxes, query);
  if (matches.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
        <EmptyState
          icon={SearchX}
          title={`No box holds “${query.trim()}”`}
          description="It may not be packed yet. Check Not packed, or search all of Inventory."
          action={
            <Button size="sm" variant="outline" onClick={onClear}>
              Clear search
            </Button>
          }
        />
      </div>
    );
  }
  const things = matchCount(matches);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {things} {things === 1 ? 'thing' : 'things'} in {matches.length}{' '}
        {matches.length === 1 ? 'box' : 'boxes'}
      </p>
      <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto md:max-xl:grid-cols-2 xl:grid-cols-3">
        {matches.map((match) => (
          <MatchCard
            key={match.box.id}
            match={match}
            world={world}
            selectedId={selectedId}
            pendingIds={pendingIds}
            disabledReason={disabledReason}
            rejections={rejections}
            onAction={onAction}
            onOpenBox={onOpenBox}
          />
        ))}
      </ul>
    </div>
  );
}
