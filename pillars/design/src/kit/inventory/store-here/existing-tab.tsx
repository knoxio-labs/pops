/**
 * The Existing tab: search everything active, tick one or many, and see
 * what the store would do before pressing it. Items that cannot go in stay
 * listed, dimmed, with the reason.
 */
import { Search } from 'lucide-react';

import { Checkbox, Input, cn } from '@pops/ui';

import { ItemMark } from '../shared/item-mark';
import { PlacementPath } from '../shared/placement-path';

import type { PlacementWorld } from '../shared/placement-model';
import type { StoreCandidate } from './store-here-model';

function CandidateRow({
  candidate,
  world,
  selected,
  onToggle,
}: {
  candidate: StoreCandidate;
  world: PlacementWorld;
  selected: boolean;
  onToggle: () => void;
}) {
  const { item, refusal } = candidate;
  const refused = refusal !== null;
  return (
    <li>
      <label
        className={cn(
          'relative flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1',
          selected ? 'bg-app-accent/10' : 'hover:bg-muted/60',
          refused && 'cursor-not-allowed opacity-55 hover:bg-transparent'
        )}
      >
        <Checkbox
          checked={selected}
          disabled={refused}
          onCheckedChange={onToggle}
          aria-label={`Store ${item.name}`}
        />
        <ItemMark item={item} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.name}</span>
          {refused ? (
            <span className="block truncate text-xs text-muted-foreground">{refusal}</span>
          ) : (
            <PlacementPath
              world={world}
              placement={item.placement}
              maxSegments={2}
              className="text-xs"
            />
          )}
        </span>
        {item.quantity > 1 ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            ×{item.quantity}
          </span>
        ) : null}
      </label>
    </li>
  );
}

/** Props for {@link ExistingTab}. */
export interface ExistingTabProps {
  world: PlacementWorld;
  query: string;
  onQuery: (query: string) => void;
  candidates: readonly StoreCandidate[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
}

/** The tab body. */
export function ExistingTab(props: ExistingTabProps) {
  const { candidates, query } = props;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          disabled={props.disabled}
          aria-label="Search items by name, code, type or place"
          placeholder="Search by name, code, type or place"
          onChange={(event) => props.onQuery(event.target.value)}
          className="h-9 pl-9"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {query.trim() === ''
          ? 'In hand first, then everything else by name.'
          : `${candidates.length} matches`}
      </p>
      {candidates.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No active item matches “{query.trim()}”. Try its code or the place it is in.
        </p>
      ) : (
        <ul aria-label="Items to store" className="-mx-2 min-h-0 flex-1 overflow-y-auto">
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.item.id}
              candidate={candidate}
              world={props.world}
              selected={props.selected.has(candidate.item.id)}
              onToggle={() => props.onToggle(candidate.item.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
