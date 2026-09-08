import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppContextProvider } from './AppContextProvider';
import { _clearRegistry } from './result-component-registry';
import { SearchInput } from './SearchInput';
import { useSearchStore } from './searchStore';

import type { ReactNode } from 'react';

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
        ({
          ok: true,
          status: 200,
          json: async () => ({ sections }),
        }) as unknown as Response
    )
  );
}

function renderSearchInput(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <AppContextProvider>{children}</AppContextProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  render(<SearchInput />, { wrapper: Wrapper });
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
    localStorage.clear();
    useSearchStore.setState({ query: '', isOpen: false });
  });

  afterEach(() => {
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
});
