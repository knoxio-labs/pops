import { SectionView } from './search-results/SectionView';
import { sortSections } from './search-results/usePanelDismiss';

import type { ReactNode } from 'react';

import type { SearchHitData } from './uri-resolver';

/** A single search hit within a section. */
export interface SearchResultHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: string;
  data: Record<string, unknown>;
}

/** A grouped section of search results for one domain. */
export interface SearchResultSection {
  domain: string;
  label: string;
  icon: ReactNode;
  color: string;
  hits: SearchResultHit[];
  totalCount: number;
  isContext: boolean;
}

export interface SearchResultsPanelProps {
  sections: SearchResultSection[];
  query: string;
  onClose: () => void;
  onResultClick?: (uri: string, data: SearchHitData) => void;
  onShowMore?: (domain: string) => void;
  /** Index of the currently keyboard-selected result (flat, across all sections). -1 = none. */
  selectedIndex?: number;
  /** id applied to the listbox root, referenced by the input's `aria-controls`. */
  listboxId?: string;
}

export function SearchResultsPanel({
  sections,
  query,
  onClose: _onClose,
  onResultClick,
  onShowMore,
  selectedIndex = -1,
  listboxId,
}: SearchResultsPanelProps) {
  const sortedSections = sortSections(sections);

  if (sortedSections.length === 0) {
    return (
      <div
        id={listboxId}
        role="listbox"
        aria-label="Search results"
        className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-popover p-4 text-center text-sm text-muted-foreground shadow-lg"
        data-testid="search-results-panel"
      >
        No results found
      </div>
    );
  }

  const sectionsWithStartIndex = sortedSections.reduce<
    { section: SearchResultSection; startIndex: number }[]
  >((acc, section) => {
    const previous = acc[acc.length - 1];
    const startIndex = previous ? previous.startIndex + previous.section.hits.length : 0;
    acc.push({ section, startIndex });
    return acc;
  }, []);

  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Search results"
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border bg-popover shadow-lg"
      data-testid="search-results-panel"
    >
      {sectionsWithStartIndex.map(({ section, startIndex }) => (
        <SectionView
          key={section.domain}
          section={section}
          query={query}
          startIndex={startIndex}
          selectedIndex={selectedIndex}
          onResultClick={onResultClick}
          onShowMore={onShowMore}
        />
      ))}
    </div>
  );
}
