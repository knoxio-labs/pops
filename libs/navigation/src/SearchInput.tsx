import { useCallback, useEffect, useRef, useState } from 'react';

import { useCurrentApp } from './hooks';
import { useRecentSearches } from './recent-searches';
import {
  registerGlobalSearchInput,
  useSearchDropdown,
} from './search-input/search-dropdown-registry';
import { SearchInputContent } from './search-input/SearchInputField';
import { useSearchInputData } from './search-input/useSearchInputData';
import { useSearchInputFocus } from './search-input/useSearchInputFocus';
import { useCmdKShortcut, useSearchInputHandlers } from './search-input/useSearchInputHandlers';
import { useSearchInputSelection } from './search-input/useSearchInputSelection';
import { usePanelDismiss } from './search-results/usePanelDismiss';
import { useSearchStore } from './searchStore';
import { useFocusTrap } from './useFocusTrap';

import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject, RefObject } from 'react';

import type { SearchDropdownRegistration } from './search-input/search-dropdown-registry';

type RegisteredKeyHandler = (event: ReactKeyboardEvent<HTMLInputElement>) => boolean;

interface RegisteredSearchState {
  keyHandlerRef: MutableRefObject<RegisteredKeyHandler | null>;
  activeDescendant: string | undefined;
  setActiveDescendant: (id: string | undefined) => void;
  onKeyDown: ((event: ReactKeyboardEvent<HTMLInputElement>) => void) | undefined;
  show: boolean;
}

function useRegisteredSearchState(
  registration: SearchDropdownRegistration | null,
  isOpen: boolean,
  isFocused: boolean,
  query: string
): RegisteredSearchState {
  const keyHandlerRef = useRef<RegisteredKeyHandler | null>(null);
  const [activeDescendant, setActiveDescendant] = useState<string | undefined>(undefined);
  const show = registration !== null && isOpen && (isFocused || query.length > 0);
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>): void => {
      if (show && keyHandlerRef.current?.(event)) event.preventDefault();
    },
    [show]
  );

  return {
    keyHandlerRef,
    activeDescendant,
    setActiveDescendant,
    onKeyDown: registration === null ? undefined : handleKeyDown,
    show,
  };
}

function useGlobalSearchInput(inputRef: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    return registerGlobalSearchInput(input);
  }, [inputRef]);
}

/** Renders the persistent shell search input and its app-owned dropdown. */
export function SearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const registration = useSearchDropdown(useCurrentApp());
  const query = useSearchStore((state) => state.query);
  const isOpen = useSearchStore((state) => state.isOpen);
  const setOpen = useSearchStore((state) => state.setOpen);
  const focus = useSearchInputFocus({ containerRef, setOpen });
  const recentSearches = useRecentSearches();
  const data = useSearchInputData({ query, isOpen: isOpen && registration === null });
  const handlers = useSearchInputHandlers({ inputRef, addQuery: recentSearches.addQuery });
  const selection = useSearchInputSelection({
    containerRef,
    inputRef,
    isRecentView: query.length === 0,
    queries: recentSearches.queries,
    orderedHits: data.orderedHits,
    onSelectHit: handlers.handleResultClick,
    onClose: handlers.handleClose,
    enabled: registration === null,
  });
  const registered = useRegisteredSearchState(registration, isOpen, focus.isFocused, query);
  useGlobalSearchInput(inputRef);
  useCmdKShortcut(inputRef);

  const showPanel =
    isOpen && (query.length > 0 || (focus.isFocused && recentSearches.queries.length > 0));
  useFocusTrap({ containerRef, active: registration === null && showPanel });
  usePanelDismiss(containerRef, handlers.handleClose);

  return (
    <SearchInputContent
      containerRef={containerRef}
      inputRef={inputRef}
      query={query}
      registration={registration}
      showPanel={showPanel}
      showRegistered={registered.show}
      data={data}
      handlers={handlers}
      selection={selection}
      queries={recentSearches.queries}
      clearRecent={recentSearches.clearAll}
      registered={registered}
      focus={focus}
    />
  );
}
