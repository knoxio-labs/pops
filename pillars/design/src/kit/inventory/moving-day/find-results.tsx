/**
 * The answer to "which box is it in?": each matching box with its stage,
 * where it is and where it is going, and the matching things inside it.
 */
import { SearchX } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { QuantityBadge } from '../foundation';
import { BoxCard } from './box-card';
import { findInBoxes, matchCount } from './find-in-boxes';

import type { PlacementWorld } from '../foundation';
import type { BoxSummary } from './moving-model';

/** Props for {@link FindResults}. */
export interface FindResultsProps {
  world: PlacementWorld;
  boxes: readonly BoxSummary[];
  query: string;
  onClear: () => void;
  onOpenBox: (id: string) => void;
}

/** The results. */
export function FindResults({ world, boxes, query, onClear, onOpenBox }: FindResultsProps) {
  const matches = findInBoxes(world, boxes, query);
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
        {things === 1 ? '1 thing' : `${things} things`} in{' '}
        {matches.length === 1 ? '1 box' : `${matches.length} boxes`}
      </p>
      <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
        {matches.map((match) => (
          <li key={match.summary.box.id} className="space-y-1.5 rounded-xl border bg-muted/40 p-2">
            <ul>
              <BoxCard
                summary={match.summary}
                world={world}
                onOpen={() => onOpenBox(match.summary.box.id)}
              />
            </ul>
            <ul aria-label={`Matches in ${match.summary.box.name}`} className="space-y-0.5 px-1">
              {match.items.map((entry) => (
                <li key={entry.id} className="flex h-8 items-center gap-2 rounded-md px-2 text-sm">
                  <span className="truncate">{entry.name}</span>
                  <QuantityBadge quantity={entry.quantity} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
