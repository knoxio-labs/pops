import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { RootLayout } from './RootLayout';

vi.mock('@/app/BootRegistryProvider', () => ({
  useRegisteredApps: () => [],
}));

vi.mock('@/app/overlays/registry', () => ({
  installedOverlays: [],
}));

vi.mock('@/store/uiStore', () => {
  const state = {
    sidebarOpen: false,
    pageNavOpen: false,
    setPageNavOpen: () => undefined,
  };

  return {
    useUIStore: <T,>(selector: (value: typeof state) => T): T => selector(state),
  };
});

vi.mock('@pops/navigation', () => ({
  AppContextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@pops/ui', () => ({
  cn: (...classes: Array<string | undefined | false>) => classes.filter(Boolean).join(' '),
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../capture/CaptureHotkeyHost', () => ({
  CaptureHotkeyHost: () => null,
}));

vi.mock('../overlays/OverlayHost', () => ({
  OverlayHost: () => null,
}));

vi.mock('../overlays/useOverlayShortcuts', () => ({
  useOverlayShortcuts: () => undefined,
}));

vi.mock('./ChatFab', () => ({
  ChatFab: () => null,
}));

vi.mock('./root-layout/AmbientBackground', () => ({
  AmbientBackground: () => null,
}));

vi.mock('./root-layout/NavRegion', () => ({
  NavRegion: () => null,
}));

vi.mock('./root-layout/usePageNavAutoClose', () => ({
  usePageNavAutoClose: () => undefined,
}));

vi.mock('./Sidebar', () => ({
  Sidebar: () => null,
}));

vi.mock('./SkipLink', () => ({
  SkipLink: () => null,
}));

vi.mock('./TopBar', () => ({
  TopBar: () => null,
}));

describe('RootLayout', () => {
  it('keeps the shell content row and main shrinkable around page frames', () => {
    render(
      <MemoryRouter>
        <RootLayout />
      </MemoryRouter>
    );

    const main = screen.getByRole('main');
    expect(main).toHaveClass(
      'flex',
      'min-h-0',
      'flex-1',
      'min-w-0',
      'flex-col',
      'overflow-x-clip',
      'overflow-y-auto'
    );

    const shell = main.parentElement?.parentElement?.parentElement;
    if (shell === null || shell === undefined) throw new Error('Shell root was not rendered');
    expect(shell).toHaveClass('relative', 'h-dvh', 'overflow-hidden');

    const contentRow = main.parentElement;
    if (contentRow === null) throw new Error('Shell content row was not rendered');
    expect(contentRow).toHaveClass('flex', 'min-h-0', 'flex-1', 'overflow-hidden');

    const contentLayer = contentRow.parentElement;
    if (contentLayer === null) throw new Error('Shell content layer was not rendered');
    expect(contentLayer).toHaveClass('relative', 'z-10', 'flex', 'h-full', 'min-h-0', 'flex-col');
  });
});
