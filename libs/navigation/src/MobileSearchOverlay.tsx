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

/**
 * MobileSearchOverlay — the full-screen search surface `md:hidden` shows
 * instead of desktop's inline `SearchInput` dropdown. Renders
 * `SearchResultsPanel` once there are hits and `RecentSearches` while the
 * query is empty, driven by `useMobileSearchOverlay` — see that hook's doc
 * for the data/selection wiring and the Escape-handling decision.
 */
export function MobileSearchOverlay({ open, onClose }: MobileSearchOverlayProps) {
  const overlay = useMobileSearchOverlay({ open, onClose });

  if (!open) return null;

  return (
    <div
      ref={overlay.containerRef}
      className="fixed inset-x-0 top-0 z-50 md:hidden"
      data-testid="mobile-search-overlay"
    >
      <MobileSearchOverlayHeader
        inputRef={overlay.inputRef}
        query={overlay.query}
        expanded={overlay.showPanel}
        activeDescendantId={overlay.activeDescendantId}
        onChange={overlay.handleChange}
        onClear={overlay.handleClear}
        onClose={overlay.handleCloseOverlay}
      />
      {overlay.showPanel &&
        (overlay.query.length > 0 ? (
          <SearchResultsPanel
            sections={overlay.sections}
            query={overlay.query}
            onClose={overlay.handleCloseOverlay}
            onResultClick={overlay.handleSelectResult}
            onShowMore={overlay.handleShowMore}
            selectedIndex={overlay.selectedIndex}
            listboxId={MOBILE_SEARCH_LISTBOX_ID}
          />
        ) : (
          <div
            id={MOBILE_SEARCH_LISTBOX_ID}
            role="listbox"
            aria-label="Recent searches"
            className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-popover shadow-lg"
          >
            <RecentSearches
              queries={overlay.queries}
              onSelect={overlay.selectRecentQuery}
              onClear={overlay.clearAllRecent}
              selectedIndex={overlay.selectedIndex}
            />
          </div>
        ))}
    </div>
  );
}
