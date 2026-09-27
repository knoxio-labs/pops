import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  _clearSearchDropdowns,
  AppContextProvider,
  registerSearchDropdown,
} from '@pops/navigation';

import { BootRegistryProvider } from '../BootRegistryProvider';
import { TopBar } from './TopBar';

import type { ComponentType } from 'react';

import type { SearchDropdownProps } from '@pops/navigation';

import type { BootRegistry } from '../boot-snapshot';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-AU', changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

vi.mock('./MobileSearchOverlay', () => ({
  MobileSearchOverlay: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mobile-search-overlay" /> : null,
}));

const EMPTY_BOOT: BootRegistry = {
  manifests: [],
  registeredApps: [],
  remoteBundleUrls: [],
  bundleMap: {},
  source: 'registry',
};

const Dropdown: ComponentType<SearchDropdownProps> = () => null;

function renderTopBar(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/inventory']}>
      <QueryClientProvider client={queryClient}>
        <BootRegistryProvider value={EMPTY_BOOT}>
          <AppContextProvider>
            <TopBar />
          </AppContextProvider>
        </BootRegistryProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('TopBar inventory search registration', () => {
  afterEach(() => {
    _clearSearchDropdowns();
    vi.unstubAllGlobals();
  });

  it('a compact opener registered after TopBar mounted makes the search icon call it instead of opening the mobile overlay', () => {
    const compact = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })))
    );
    renderTopBar();

    act(() => {
      registerSearchDropdown('inventory', { Dropdown, openCompact: compact });
    });
    fireEvent.click(screen.getByTestId('mobile-search-btn'));

    expect(compact).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('mobile-search-overlay')).not.toBeInTheDocument();
  });
});
