import { Search, X } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactElement,
  type RefObject,
} from 'react';

import { Button, Input } from '@pops/ui';

import { SearchInputDropdown } from './SearchInputDropdown';

import type { SearchDropdownRegistration } from './search-dropdown-registry';
import type { useSearchInputData } from './useSearchInputData';
import type { useSearchInputFocus } from './useSearchInputFocus';
import type { SearchInputHandlers } from './useSearchInputHandlers';
import type { useSearchInputSelection } from './useSearchInputSelection';

const SEARCH_LISTBOX_ID = 'global-search-listbox';

interface SearchInputFieldProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onClear: () => void;
  /** Whether the results/recent-searches popup is currently rendered. */
  expanded: boolean;
  /** id of the listbox this combobox owns, for `aria-controls`. */
  listboxId: string;
  /** id of the option currently highlighted by keyboard nav, if any. */
  activeDescendantId?: string;
  /** Keyboard handler supplied by an app-owned dropdown. */
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Placeholder shown in the input. */
  placeholder?: string;
  /** Empty-input keyboard cap. */
  hotkeyLabel?: string;
}

/** Renders the shared input, clear control, and keyboard shortcut cap. */
export function SearchInputField({
  inputRef,
  query,
  onChange,
  onFocus,
  onBlur,
  onClear,
  expanded,
  listboxId,
  activeDescendantId,
  onKeyDown,
  placeholder = 'Search POPS...',
  hotkeyLabel = '⌘K',
}: SearchInputFieldProps) {
  return (
    <>
      <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        defaultValue={query}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        className="pl-9 pr-9 h-9 bg-muted/50 border-transparent focus:border-border focus:bg-background transition-colors"
        aria-label="Search POPS"
        // No explicit role="combobox": the browser's computed ARIA role for
        // an <input type="text"> is already "textbox", and adding
        // role="combobox" here replaces that with "combobox", which is a
        // different accessible role for assistive tech and role-based
        // queries alike. The listbox/expanded/active-descendant relationship
        // below still conveys full combobox behavior without it.
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-autocomplete="list"
        aria-controls={expanded ? listboxId : undefined}
        aria-activedescendant={expanded ? activeDescendantId : undefined}
      />
      {query ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <kbd className="absolute right-2.5 hidden lg:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground pointer-events-none">
          {hotkeyLabel}
        </kbd>
      )}
    </>
  );
}

type RegisteredKeyHandler = (event: ReactKeyboardEvent<HTMLInputElement>) => boolean;

interface RegisteredSearchState {
  keyHandlerRef: MutableRefObject<RegisteredKeyHandler | null>;
  activeDescendant: string | undefined;
  setActiveDescendant: (id: string | undefined) => void;
  onKeyDown: ((event: ReactKeyboardEvent<HTMLInputElement>) => void) | undefined;
  show: boolean;
}

interface SearchInputContentProps {
  registration: SearchDropdownRegistration | null;
  query: string;
  showPanel: boolean;
  showRegistered: boolean;
  data: ReturnType<typeof useSearchInputData>;
  handlers: SearchInputHandlers;
  selection: ReturnType<typeof useSearchInputSelection>;
  queries: string[];
  clearRecent: () => void;
  registered: RegisteredSearchState;
  containerRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  focus: ReturnType<typeof useSearchInputFocus>;
}

function SearchInputPopup(props: SearchInputContentProps): ReactElement | null {
  if (props.showPanel && props.registration === null) {
    return (
      <SearchInputDropdown
        query={props.query}
        sections={props.data.sections}
        selectedIndex={props.selection.selectedIndex}
        listboxId={SEARCH_LISTBOX_ID}
        queries={props.queries}
        onClose={props.handlers.handleClose}
        onResultClick={props.handlers.handleResultClick}
        onShowMore={props.data.handleShowMore}
        onSelectRecent={props.selection.selectRecentQuery}
        onClearRecent={props.clearRecent}
      />
    );
  }
  if (!props.showRegistered || props.registration === null) return null;
  return (
    <props.registration.Dropdown
      query={props.query}
      listboxId={SEARCH_LISTBOX_ID}
      setQuery={props.selection.selectRecentQuery}
      close={props.handlers.handleClose}
      keyHandlerRef={props.registered.keyHandlerRef}
      setActiveDescendant={props.registered.setActiveDescendant}
    />
  );
}

/** Renders the shared input with either the default or registered search panel. */
export function SearchInputContent({
  containerRef,
  inputRef,
  query,
  registration,
  showPanel,
  showRegistered,
  data,
  handlers,
  selection,
  queries,
  clearRecent,
  registered,
  focus,
}: SearchInputContentProps): ReactElement {
  const expanded = registration === null ? showPanel : showRegistered;
  let activeDescendantId = registered.activeDescendant;
  if (registration === null) activeDescendantId = selection.activeDescendantId;
  if (registration !== null && !showRegistered) activeDescendantId = undefined;

  return (
    <div
      ref={containerRef}
      className={
        registration?.openCompact
          ? 'hidden lg:flex relative items-center max-w-sm w-full mx-4'
          : 'hidden md:flex relative items-center max-w-sm w-full mx-4'
      }
    >
      <SearchInputField
        inputRef={inputRef}
        query={query}
        onChange={handlers.handleChange}
        onClear={handlers.handleClear}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        onKeyDown={registered.onKeyDown}
        placeholder={registration?.placeholder}
        hotkeyLabel={registration?.hotkeyLabel}
        expanded={expanded}
        listboxId={SEARCH_LISTBOX_ID}
        activeDescendantId={activeDescendantId}
      />
      <SearchInputPopup
        registration={registration}
        query={query}
        showPanel={showPanel}
        showRegistered={showRegistered}
        data={data}
        handlers={handlers}
        selection={selection}
        queries={queries}
        clearRecent={clearRecent}
        registered={registered}
        containerRef={containerRef}
        inputRef={inputRef}
        focus={focus}
      />
    </div>
  );
}
