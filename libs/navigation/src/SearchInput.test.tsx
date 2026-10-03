import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { act, useEffect } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppContextProvider } from './AppContextProvider';
import { _clearRegistry } from './result-component-registry';
import {
  _clearSearchDropdowns,
  focusGlobalSearch,
  registerSearchDropdown,
} from './search-input/search-dropdown-registry';
import { SearchInput } from './SearchInput';
import { useSearchStore } from './searchStore';

import type { ReactElement, ReactNode } from 'react';

import type { SearchDropdownProps } from './search-input/search-dropdown-registry';

const RECENT_STORAGE_KEY = 'pops:recent-searches';

interface WireHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: string;
  data?: unknown;
}

interface WireSection {
  domain: string;
  moduleId: string;
  hits: WireHit[];
  icon: string;
  color: string;
  isContextSection: boolean;
  totalCount: number;
}

function makeSection(overrides: Partial<WireSection> = {}): WireSection {
  return {
    domain: 'movies',
    moduleId: 'media',
    icon: 'Film',
    color: 'purple',
    isContextSection: false,
    hits: [
      {
        uri: 'pops:media/movie/1',
        score: 0.9,
        matchField: 'title',
        matchType: 'prefix',
        data: { title: 'The Matrix' },
      },
    ],
    totalCount: 1,
    ...overrides,
  };
}

function mockFetchWith(sections: WireSection[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify({ sections }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
  );
}

function renderSearchInput(initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AppContextProvider>{children}</AppContextProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(<SearchInput />, { wrapper: Wrapper });
}

function HandledDropdown({ keyHandlerRef, setActiveDescendant, close }: SearchDropdownProps) {
  useEffect(() => {
    keyHandlerRef.current = (event) => {
      if (event.key === 'ArrowDown') {
        setActiveDescendant('test-option');
        return true;
      }
      if (event.key === 'Escape') {
        close();
        return true;
      }
      return false;
    };
    return () => {
      keyHandlerRef.current = null;
    };
  }, [close, keyHandlerRef, setActiveDescendant]);

  return (
    <div id="global-search-listbox" role="listbox">
      <div id="test-option" role="option" aria-selected="false">
        Result
      </div>
    </div>
  );
}

function FocusableDropdown({ keyHandlerRef }: SearchDropdownProps): ReactElement {
  useEffect(() => {
    keyHandlerRef.current = () => false;
    return () => {
      keyHandlerRef.current = null;
    };
  }, [keyHandlerRef]);

  return (
    <div id="global-search-listbox" role="listbox">
      <button type="button">First action</button>
      <button type="button">Second action</button>
    </div>
  );
}

const registeredKeySpy = vi.fn();

function AlwaysHandledDropdown({ keyHandlerRef, close }: SearchDropdownProps): ReactElement {
  useEffect(() => {
    keyHandlerRef.current = (event) => {
      registeredKeySpy(event.key);
      if (event.key === 'Escape') close();
      return true;
    };
    return () => {
      keyHandlerRef.current = null;
    };
  }, [close, keyHandlerRef]);

  return <div id="global-search-listbox" role="listbox" />;
}

function SetQueryDropdown({ keyHandlerRef, setQuery }: SearchDropdownProps): ReactElement {
  useEffect(() => {
    keyHandlerRef.current = () => false;
    return () => {
      keyHandlerRef.current = null;
    };
  }, [keyHandlerRef]);

  return (
    <div id="global-search-listbox" role="listbox">
      <button type="button" onClick={() => setQuery('recent query')}>
        Choose recent query
      </button>
    </div>
  );
}

function seedRecentSearches(queries: string[]): void {
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(queries));
}

async function openWithResults(): Promise<void> {
  mockFetchWith([makeSection()]);
  await act(async () => {
    useSearchStore.getState().setQuery('matrix');
  });
  await screen.findByTestId('search-results-panel');
}

describe('SearchInput — combobox ARIA and dismissal', () => {
  beforeEach(() => {
    _clearRegistry();
    _clearSearchDropdowns();
    registeredKeySpy.mockClear();
    localStorage.clear();
    useSearchStore.setState({ query: '', isOpen: false });
  });

  afterEach(() => {
    _clearSearchDropdowns();
    vi.unstubAllGlobals();
  });

  it('exposes combobox semantics on the input', () => {
    renderSearchInput();
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-haspopup', 'listbox');
  });

  it('aria-expanded is false when the popup is closed and true once results render', async () => {
    renderSearchInput();
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');

    await openWithResults();

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', 'global-search-listbox');
    expect(screen.getByTestId('search-results-panel')).toHaveAttribute(
      'id',
      'global-search-listbox'
    );
  });

  it('aria-expanded is true and a listbox renders while only recent searches show', () => {
    seedRecentSearches(['matrix']);
    renderSearchInput();
    const input = screen.getByRole('textbox', { name: 'Search POPS' });

    fireEvent.focus(input);

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('recent-searches')).toBeInTheDocument();
    expect(screen.getByRole('listbox')).toHaveAttribute('id', 'global-search-listbox');
  });

  it('aria-activedescendant follows ArrowDown/ArrowUp and points at the rendered active option', () => {
    seedRecentSearches(['matrix', 'inception']);
    renderSearchInput();
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    fireEvent.focus(input);

    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'search-option-0');
    const first = document.getElementById('search-option-0');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveTextContent('matrix');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'search-option-1');
    expect(document.getElementById('search-option-0')).toHaveAttribute('aria-selected', 'false');
    const second = document.getElementById('search-option-1');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveTextContent('inception');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveAttribute('aria-activedescendant', 'search-option-0');
  });

  it('dismisses on outside click while results are shown', async () => {
    renderSearchInput();
    await openWithResults();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByTestId('search-results-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search POPS' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('dismisses on outside click while only recent searches are shown (previously not handled at all)', () => {
    seedRecentSearches(['matrix']);
    renderSearchInput();
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    fireEvent.focus(input);
    expect(screen.getByTestId('recent-searches')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByTestId('recent-searches')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not dismiss on a click inside the panel', async () => {
    renderSearchInput();
    await openWithResults();

    fireEvent.mouseDown(screen.getByTestId('search-results-panel'));

    expect(screen.getByTestId('search-results-panel')).toBeInTheDocument();
  });

  it('clearing recent searches drops them from keyboard nav too, not just the rendered list', () => {
    seedRecentSearches(['matrix', 'inception']);
    renderSearchInput();
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    fireEvent.focus(input);
    expect(screen.getByTestId('recent-searches')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('clear-recent'));

    expect(screen.queryByTestId('recent-searches')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-controls');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input).toHaveValue('');
  });

  it('an app without a registered dropdown keeps the current placeholder and cap', () => {
    renderSearchInput();

    expect(screen.getByPlaceholderText('Search POPS...')).toBeInTheDocument();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });

  it('sends the detected app as context when federated search has no app dropdown', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ sections: [makeSection()] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    renderSearchInput('/purchases/abc');

    await act(async () => {
      useSearchStore.getState().setQuery('matrix');
    });
    await screen.findByTestId('search-results-panel');

    const init = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      query: { text: 'matrix' },
      context: { app: 'purchases', page: null },
    });
  });

  it('a dropdown registered after SearchInput mounted replaces the placeholder and cap without another render trigger', () => {
    renderSearchInput('/inventory');
    expect(screen.getByPlaceholderText('Search POPS...')).toBeInTheDocument();

    act(() => {
      registerSearchDropdown('inventory', {
        Dropdown: HandledDropdown,
        placeholder: 'Name, code, note, type or place',
        hotkeyLabel: '/',
      });
    });

    expect(screen.getByPlaceholderText('Name, code, note, type or place')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();
    expect(screen.queryByText('⌘K')).not.toBeInTheDocument();
  });

  it('unregistering restores the default placeholder and cap', () => {
    const registration = {
      Dropdown: HandledDropdown,
      placeholder: 'Name, code, note, type or place',
      hotkeyLabel: '/',
    };
    const unregister = registerSearchDropdown('inventory', registration);
    renderSearchInput('/inventory');
    expect(screen.getByPlaceholderText('Name, code, note, type or place')).toBeInTheDocument();

    act(unregister);

    expect(screen.getByPlaceholderText('Search POPS...')).toBeInTheDocument();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });

  it('an app with a registered dropdown renders it and hands it the box keys', () => {
    mockFetchWith([]);
    registerSearchDropdown('inventory', { Dropdown: HandledDropdown });
    renderSearchInput('/inventory');
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    fireEvent.focus(input);

    const arrow = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    const preventArrow = vi.spyOn(arrow, 'preventDefault');
    act(() => input.dispatchEvent(arrow));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-activedescendant', 'test-option');
    expect(preventArrow).toHaveBeenCalledOnce();
    expect(input).not.toHaveAttribute('aria-activedescendant', 'search-option-0');

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: 'cable' } });
    act(() => vi.advanceTimersByTime(301));
    vi.useRealTimers();
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(
      expect.stringContaining('/orchestrator-api/search'),
      expect.anything()
    );
  });

  it('the registered placeholder and hotkey label replace the defaults', () => {
    registerSearchDropdown('inventory', {
      Dropdown: HandledDropdown,
      placeholder: 'Inventory search',
      hotkeyLabel: '/',
    });
    renderSearchInput('/inventory');

    expect(screen.getByPlaceholderText('Inventory search')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();
  });

  it("the box's aria-activedescendant follows setActiveDescendant", () => {
    registerSearchDropdown('inventory', { Dropdown: HandledDropdown });
    renderSearchInput('/inventory');
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(input).toHaveAttribute('aria-activedescendant', 'test-option');
  });

  it('Esc from the registered dropdown hides it and keeps the text', () => {
    registerSearchDropdown('inventory', { Dropdown: HandledDropdown });
    renderSearchInput('/inventory');
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'cable' } });

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveValue('cable');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('after Esc hides the registered dropdown, Tab and ArrowDown are not handled by it', () => {
    registerSearchDropdown('inventory', { Dropdown: AlwaysHandledDropdown });
    renderSearchInput('/inventory');
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    fireEvent.focus(input);
    act(() => fireEvent.keyDown(input, { key: 'Escape' }));
    expect(registeredKeySpy).toHaveBeenCalledWith('Escape');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    registeredKeySpy.mockClear();

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    const arrow = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    const preventTab = vi.spyOn(tab, 'preventDefault');
    const preventArrow = vi.spyOn(arrow, 'preventDefault');
    act(() => {
      input.dispatchEvent(tab);
      input.dispatchEvent(arrow);
    });

    expect(preventTab).not.toHaveBeenCalled();
    expect(preventArrow).not.toHaveBeenCalled();
    expect(registeredKeySpy).not.toHaveBeenCalled();
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('with the registered dropdown shown and a blank query, Tab on the box is not default-prevented; Shift-Tab with a typed query is not default-prevented', () => {
    registerSearchDropdown('inventory', { Dropdown: FocusableDropdown });
    renderSearchInput('/inventory');
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    act(() => input.focus());

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    const preventTab = vi.spyOn(tab, 'preventDefault');
    input.dispatchEvent(tab);
    expect(preventTab).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('button', { name: 'First action' })).not.toHaveFocus();

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: 'cab' } });
    act(() => vi.advanceTimersByTime(301));
    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventShiftTab = vi.spyOn(shiftTab, 'preventDefault');
    input.dispatchEvent(shiftTab);
    vi.useRealTimers();

    expect(preventShiftTab).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('button', { name: 'First action' })).not.toHaveFocus();
  });

  it("the registered dropdown's setQuery writes the box and the store", () => {
    registerSearchDropdown('inventory', { Dropdown: SetQueryDropdown });
    renderSearchInput('/inventory');
    const input = screen.getByRole('textbox', { name: 'Search POPS' });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('button', { name: 'Choose recent query' }));

    expect(input).toHaveValue('recent query');
    expect(useSearchStore.getState().query).toBe('recent query');
  });

  it('registers its input so focusGlobalSearch focuses it, and unregisters on unmount', () => {
    const view = renderSearchInput('/inventory');
    const input = screen.getByRole('textbox', { name: 'Search POPS' });

    expect(focusGlobalSearch()).toBe(true);
    expect(document.activeElement).toBe(input);

    view.unmount();

    expect(focusGlobalSearch()).toBe(false);
  });

  it('an app with a compact opener renders the box hidden lg:flex; others keep hidden md:flex', () => {
    renderSearchInput();
    const defaultContainer = screen.getByRole('textbox', { name: 'Search POPS' }).parentElement;
    expect(defaultContainer).toHaveClass('hidden', 'md:flex');

    _clearSearchDropdowns();
    registerSearchDropdown('inventory', { Dropdown: HandledDropdown, openCompact: vi.fn() });
    renderSearchInput('/inventory');
    const compactContainer = screen
      .getAllByRole('textbox', { name: 'Search POPS' })
      .at(-1)?.parentElement;
    expect(compactContainer).toHaveClass('hidden', 'lg:flex');
  });
});
