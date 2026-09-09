import { searchOptionId } from './search-keyboard-nav';

/**
 * RecentSearches — renders a list of recent search queries.
 *
 * Shown when the search input is focused and empty. Arrow keys move through
 * it exactly as they do through result rows (same `useSearchKeyboardNav`
 * instance in the parent, same `data-result-index`/`aria-selected` wiring),
 * so a query is reachable and selectable without a mouse.
 * Click a query to populate the input and trigger search.
 * "Clear recent" button removes all history.
 */

interface RecentSearchesProps {
  queries: string[];
  onSelect: (query: string) => void;
  onClear: () => void;
  /** Index of the currently keyboard-selected query. -1 = none. */
  selectedIndex?: number;
}

interface RecentSearchRowProps {
  query: string;
  index: number;
  isSelected: boolean;
  onSelect: (query: string) => void;
}

function RecentSearchRow({ query, index, isSelected, onSelect }: RecentSearchRowProps) {
  return (
    <li
      id={searchOptionId(index)}
      role="option"
      aria-selected={isSelected}
      data-result-index={index}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={() => {
          onSelect(query);
        }}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left${isSelected ? ' bg-accent' : ''}`}
        data-testid={`recent-query-${query}`}
      >
        <svg
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="truncate">{query}</span>
      </button>
    </li>
  );
}

export function RecentSearches({
  queries,
  onSelect,
  onClear,
  selectedIndex = -1,
}: RecentSearchesProps) {
  if (queries.length === 0) return null;

  return (
    <div className="flex flex-col" data-testid="recent-searches">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Recent searches</span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="clear-recent"
        >
          Clear recent
        </button>
      </div>
      <ul>
        {queries.map((query, index) => (
          <RecentSearchRow
            key={query}
            query={query}
            index={index}
            isSelected={index === selectedIndex}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </div>
  );
}
