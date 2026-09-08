import { useRecentSearches } from '../recent-searches';
import { RecentSearches } from '../RecentSearches';
import { SearchResultsPanel, type SearchResultSection } from '../SearchResultsPanel';

import type { SearchHitData } from '../uri-resolver';

interface SearchInputDropdownProps {
  query: string;
  sections: SearchResultSection[];
  selectedIndex: number;
  listboxId: string;
  onClose: () => void;
  onResultClick: (uri: string, data: SearchHitData) => void;
  onShowMore: (domain: string) => Promise<void> | void;
  onSelectRecent: (query: string) => void;
}

export function SearchInputDropdown({
  query,
  sections,
  selectedIndex,
  listboxId,
  onClose,
  onResultClick,
  onShowMore,
  onSelectRecent,
}: SearchInputDropdownProps) {
  const { queries, clearAll } = useRecentSearches();

  if (query.length > 0) {
    return (
      <SearchResultsPanel
        sections={sections}
        query={query}
        onClose={onClose}
        onResultClick={onResultClick}
        onShowMore={onShowMore}
        selectedIndex={selectedIndex}
        listboxId={listboxId}
      />
    );
  }

  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Recent searches"
      className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-popover shadow-lg"
    >
      <RecentSearches
        queries={queries}
        onSelect={onSelectRecent}
        onClear={clearAll}
        selectedIndex={selectedIndex}
      />
    </div>
  );
}
