import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppContextProvider } from './AppContextProvider';
import { MobileSearchOverlay } from './MobileSearchOverlay';
import { _clearRegistry } from './result-component-registry';
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

function renderOverlay(onClose = vi.fn()): { onClose: typeof onClose } {
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
  render(<MobileSearchOverlay open onClose={onClose} />, { wrapper: Wrapper });
  return { onClose };
}

function seedRecentSearches(queries: string[]): void {
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(queries));
}

async function openWithResults(onClose = vi.fn()): Promise<{ onClose: typeof onClose }> {
  mockFetchWith([makeSection()]);
  const rendered = renderOverlay(onClose);
  await act(async () => {
    useSearchStore.getState().setQuery('matrix');
  });
  await screen.findByTestId('search-results-panel');
  return rendered;
}

describe('MobileSearchOverlay', () => {
  beforeEach(() => {
    _clearRegistry();
    localStorage.clear();
    useSearchStore.setState({ query: '', isOpen: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing when closed', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <AppContextProvider>
            <MobileSearchOverlay open={false} onClose={vi.fn()} />
          </AppContextProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.queryByTestId('mobile-search-overlay')).not.toBeInTheDocument();
  });

  describe('render-with-results', () => {
    it('renders SearchResultsPanel with the matching hits once a query resolves', async () => {
      await openWithResults();

      expect(screen.getByTestId('search-results-panel')).toBeInTheDocument();
      expect(screen.getByText('Movies')).toBeInTheDocument();
      expect(screen.getByText('The Matrix')).toBeInTheDocument();
    });

    it('exposes combobox semantics on the input once the results listbox renders', async () => {
      await openWithResults();

      const input = screen.getByRole('textbox', { name: 'Search POPS' });
      expect(input).toHaveAttribute('aria-haspopup', 'listbox');
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(input).toHaveAttribute('aria-controls', 'mobile-search-listbox');
      expect(screen.getByTestId('search-results-panel')).toHaveAttribute(
        'id',
        'mobile-search-listbox'
      );
    });

    it('selecting a result closes the overlay', async () => {
      const { onClose } = await openWithResults();

      fireEvent.click(screen.getByRole('button', { name: /The Matrix/i }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('recent-searches-on-empty-query', () => {
    it('renders RecentSearches while the query is empty', () => {
      seedRecentSearches(['matrix', 'inception']);
      renderOverlay();

      expect(screen.getByTestId('recent-searches')).toBeInTheDocument();
      expect(screen.getByText('matrix')).toBeInTheDocument();
      expect(screen.getByText('inception')).toBeInTheDocument();
    });

    it('renders nothing below the input when there is no query and no history', () => {
      renderOverlay();

      expect(screen.queryByTestId('recent-searches')).not.toBeInTheDocument();
      expect(screen.queryByTestId('search-results-panel')).not.toBeInTheDocument();
      const input = screen.getByRole('textbox', { name: 'Search POPS' });
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('selecting a recent query switches the overlay into the results view', async () => {
      mockFetchWith([makeSection()]);
      seedRecentSearches(['matrix']);
      renderOverlay();

      fireEvent.click(screen.getByTestId('recent-query-matrix'));

      expect(await screen.findByTestId('search-results-panel')).toBeInTheDocument();
    });
  });

  describe('arrow-key selection', () => {
    it('moves aria-activedescendant through the results with ArrowDown/ArrowUp', async () => {
      mockFetchWith([
        makeSection({
          hits: [
            {
              uri: 'pops:media/movie/1',
              score: 1.0,
              matchField: 't',
              matchType: 'exact',
              data: { title: 'The Matrix' },
            },
            {
              uri: 'pops:media/movie/2',
              score: 0.5,
              matchField: 't',
              matchType: 'contains',
              data: { title: 'The Matrix Reloaded' },
            },
          ],
          totalCount: 2,
        }),
      ]);
      renderOverlay();
      await act(async () => {
        useSearchStore.getState().setQuery('matrix');
      });
      await screen.findByTestId('search-results-panel');
      const input = screen.getByRole('textbox', { name: 'Search POPS' });

      expect(input).not.toHaveAttribute('aria-activedescendant');

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(input).toHaveAttribute('aria-activedescendant', 'search-option-0');
      const first = document.getElementById('search-option-0');
      expect(first).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(input).toHaveAttribute('aria-activedescendant', 'search-option-1');
      expect(document.getElementById('search-option-0')).toHaveAttribute('aria-selected', 'false');
    });

    it('Enter selects the highlighted result and closes the overlay', async () => {
      mockFetchWith([makeSection()]);
      const onClose = vi.fn();
      renderOverlay(onClose);
      await act(async () => {
        useSearchStore.getState().setQuery('matrix');
      });
      await screen.findByTestId('search-results-panel');
      const input = screen.getByRole('textbox', { name: 'Search POPS' });

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape closes the whole overlay in one step', async () => {
      const { onClose } = await openWithResults();
      const input = screen.getByRole('textbox', { name: 'Search POPS' });

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
