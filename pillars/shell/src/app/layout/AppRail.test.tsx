import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { BootRegistryProvider } from '../BootRegistryProvider';
import { AppRail } from './AppRail';

import type { BootRegistry } from '../boot-snapshot';

vi.mock('@/store/uiStore', () => {
  type UIState = {
    railOpen: boolean;
    setPageNavOpen: (open: boolean) => void;
    setSkipNextPageNavClose: (skip: boolean) => void;
    toggleRail: () => void;
  };

  const state: UIState = {
    railOpen: true,
    setPageNavOpen: () => undefined,
    setSkipNextPageNavClose: () => undefined,
    toggleRail: () => undefined,
  };

  return {
    useUIStore: <T,>(selector: (value: UIState) => T): T => selector(state),
  };
});

vi.mock('./app-rail/AppRailCollapsed', () => ({
  AppRailCollapsed: () => null,
}));

vi.mock('./app-rail/AppRailFooter', () => ({
  AppRailFooter: () => null,
}));

vi.mock('./app-rail/AppRailIcon', () => ({
  AppRailIcon: () => null,
}));

vi.mock('./app-rail/useIsTablet', () => ({
  useIsTablet: () => false,
}));

const BOOT: BootRegistry = {
  manifests: [],
  registeredApps: [
    {
      id: 'inventory',
      label: 'Inventory',
      labelKey: 'inventory',
      icon: 'Box',
      color: 'amber',
      basePath: '/inventory',
      items: [],
    },
  ],
  remoteBundleUrls: [],
  bundleMap: {},
  source: 'registry',
};

describe('AppRail', () => {
  it('contains its app list when the rail is taller than the viewport', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/inventory']}>
        <BootRegistryProvider value={BOOT}>
          <AppRail />
        </BootRegistryProvider>
      </MemoryRouter>
    );

    expect(container.firstElementChild).toHaveClass('h-full', 'min-h-0', 'overflow-y-auto');
  });
});
