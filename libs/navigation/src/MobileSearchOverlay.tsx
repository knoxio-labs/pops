import { ArrowLeft } from 'lucide-react';
import { type RefObject } from 'react';

import { Button } from '@pops/ui';

import {
  MOBILE_SEARCH_LISTBOX_ID,
  useMobileSearchOverlay,
} from './mobile-search/useMobileSearchOverlay';
import { RecentSearches } from './RecentSearches';
import { SearchInputField } from './search-input/SearchInputField';
import { SearchResultsPanel } from './SearchResultsPanel';

import type { SearchResultSection } from './SearchResultsPanel';
import type { SearchHitData } from './uri-resolver';

interface MobileSearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface MobileSearchOverlayHeaderProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  expanded: boolean;
  activeDescendantId: string | undefined;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onClose: () => void;
}

function MobileSearchOverlayHeader({
  inputRef,
  query,
  expanded,
  activeDescendantId,
  onChange,
  onClear,
  onClose,
}: MobileSearchOverlayHeaderProps) {
  return (
    <div className="flex h-14 items-center gap-2 border-b border-border bg-card px-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="min-h-[44px] min-w-[44px] shrink-0"
        aria-label="Close search"
        data-testid="mobile-search-close"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="relative flex flex-1 items-center">
        <SearchInputField
          inputRef={inputRef}
          query={query}
          onChange={onChange}
          onFocus={() => {}}
          onBlur={() => {}}
          onClear={onClear}
          listboxId={MOBILE_SEARCH_LISTBOX_ID}
          expanded={expanded}
          activeDescendantId={activeDescendantId}
        />
      </div>
    </div>
  );
}

interface MobileSearchPanelProps {
  query: string;
  sections: SearchResultSection[];
  queries: string[];
  selectedIndex: number;
  onClose: () => void;
  onResultClick: (uri: string, data: SearchHitData) => void;
  onShowMore: (domain: string) => Promise<void> | void;
  onSelectRecent: (recentQuery: string) => void;
  onClearRecent: () => void;
}

function MobileSearchPanel({
  query,
  sections,
  queries,
  selectedIndex,
  onClose,
  onResultClick,
  onShowMore,
  onSelectRecent,
  onClearRecent,
}: MobileSearchPanelProps) {
  if (query.length > 0) {
    return (
      <SearchResultsPanel
        sections={sections}
        query={query}
        onClose={onClose}
        onResultClick={onResultClick}
        onShowMore={onShowMore}
        selectedIndex={selectedIndex}
        listboxId={MOBILE_SEARCH_LISTBOX_ID}
      />
    );
  }
  return (
    <div
      id={MOBILE_SEARCH_LISTBOX_ID}
      role="listbox"
      aria-label="Recent searches"
      className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-popover shadow-lg"
    >
      <RecentSearches
        queries={queries}
        onSelect={onSelectRecent}
        onClear={onClearRecent}
        selectedIndex={selectedIndex}
      />
    </div>
  );
}

/**
 * MobileSearchOverlay — the full-screen search surface `md:hidden` shows
 * instead of desktop's inline `SearchInput` dropdown. Renders
 * `SearchResultsPanel` once there are hits and `RecentSearches` while the
 * query is empty, driven by `useMobileSearchOverlay` — see that hook's doc
 * for the data/selection wiring and the Escape-handling decision.
 */
export function MobileSearchOverlay({ open, onClose }: MobileSearchOverlayProps) {
  const {
    inputRef,
    containerRef,
    query,
    queries,
    sections,
    showPanel,
    selectedIndex,
    activeDescendantId,
    handleChange,
    handleClear,
    handleCloseOverlay,
    handleSelectResult,
    handleShowMore,
    selectRecentQuery,
    clearAllRecent,
  } = useMobileSearchOverlay({ open, onClose });

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-x-0 top-0 z-50 md:hidden"
      data-testid="mobile-search-overlay"
    >
      <MobileSearchOverlayHeader
        inputRef={inputRef}
        query={query}
        expanded={showPanel}
        activeDescendantId={activeDescendantId}
        onChange={handleChange}
        onClear={handleClear}
        onClose={handleCloseOverlay}
      />
      {showPanel && (
        <MobileSearchPanel
          query={query}
          sections={sections}
          queries={queries}
          selectedIndex={selectedIndex}
          onClose={handleCloseOverlay}
          onResultClick={handleSelectResult}
          onShowMore={handleShowMore}
          onSelectRecent={selectRecentQuery}
          onClearRecent={clearAllRecent}
        />
      )}
    </div>
  );
}
