import { Button } from '@pops/ui';

import { HISTORY_FILTER_LABELS, HISTORY_FILTERS, type HistoryFilter } from './history-model.js';

/** Props for {@link HistoryFilters}. */
export interface HistoryFiltersProps {
  filter: HistoryFilter;
  counts: Readonly<Record<HistoryFilter, number>>;
  onChange: (filter: HistoryFilter) => void;
}

/** Renders the event-family filters and their loaded counts. */
export function HistoryFilters({ filter, counts, onChange }: HistoryFiltersProps) {
  return (
    <div role="group" aria-label="Show" className="flex shrink-0 flex-wrap gap-2">
      {HISTORY_FILTERS.map((id) => (
        <Button
          key={id}
          size="sm"
          variant="outline"
          aria-pressed={filter === id}
          disabled={id !== 'all' && counts[id] === 0}
          onClick={() => onChange(id)}
          className={filter === id ? 'border-app-accent/60 bg-app-accent/15' : undefined}
        >
          {HISTORY_FILTER_LABELS[id]}
          <span className="text-xs tabular-nums text-muted-foreground">{counts[id]}</span>
        </Button>
      ))}
    </div>
  );
}
