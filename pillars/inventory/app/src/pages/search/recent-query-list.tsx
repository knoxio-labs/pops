import { Search } from 'lucide-react';

import { ButtonPrimitive } from '@pops/ui';

/** Props for the recent-query chip list. */
export interface RecentQueryListProps {
  readonly queries: readonly string[];
  readonly onQuery: (query: string) => void;
}

/** Renders recent query strings as keyboard-accessible listbox options. */
export function RecentQueryList({ queries, onQuery }: RecentQueryListProps) {
  if (queries.length === 0) return null;
  return (
    <section aria-labelledby="recent-searches-heading">
      <h2
        id="recent-searches-heading"
        className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <Search className="size-3.5" aria-hidden />
        Recent searches
      </h2>
      <div role="listbox" aria-label="Recent searches">
        {queries.map((query) => (
          <ButtonPrimitive
            key={query.toLowerCase()}
            type="button"
            role="option"
            variant="ghost"
            className="flex h-auto w-full items-center justify-start gap-3 rounded-none border-b px-3 py-3 text-left hover:bg-muted/50"
            onClick={() => onQuery(query)}
          >
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate text-sm">{query}</span>
          </ButtonPrimitive>
        ))}
      </div>
    </section>
  );
}
