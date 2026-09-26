import { useUIStore } from '@/store/uiStore';
/**
 * The mobile drawer: what it lists, and the modal behaviour that keeps it from
 * trapping the page — closing on Escape and on any navigation, and holding the
 * page scroll lock only while it is open.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BootRegistryProvider } from '../BootRegistryProvider';
import { Sidebar } from './Sidebar';

import type { BootRegistry } from '../boot-snapshot';
import type { AppNavConfig } from '../nav/types';

const APPS: AppNavConfig[] = [
  {
    id: 'finance',
    label: 'Finance',
    labelKey: 'finance',
    icon: 'DollarSign',
    color: 'emerald',
    basePath: '/finance',
    items: [
      { path: '', label: 'Dashboard', labelKey: 'finance.dashboard', icon: 'LayoutDashboard' },
      {
        path: '/transactions',
        label: 'Transactions',
        labelKey: 'finance.transactions',
        icon: 'CreditCard',
      },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    labelKey: 'media',
    icon: 'Film',
    basePath: '/media',
    items: [{ path: '', label: 'Library', labelKey: 'media.library', icon: 'Film' }],
  },
];

const BOOT: BootRegistry = {
  manifests: [],
  registeredApps: APPS,
  remoteBundleUrls: [],
  bundleMap: {},
  source: 'registry',
};

/** A `(min-width: 768px)` query the test can flip, as a rotating tablet does. */
function stubViewport() {
  const listeners = new Set<() => void>();
  const mql = {
    matches: false,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => mql);
  return {
    growToDesktop: () => {
      mql.matches = true;
      listeners.forEach((listener) => listener());
    },
  };
}

let navigateTo: (path: string, options?: { replace?: boolean }) => void = () => undefined;

function NavigateProbe() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateTo = (path, options) => void navigate(path, options);
  }, [navigate]);
  return null;
}

function SidebarFromStore() {
  const open = useUIStore((state) => state.sidebarOpen);
  return <Sidebar open={open} />;
}

function renderSidebar() {
  render(
    <MemoryRouter initialEntries={['/finance']}>
      <BootRegistryProvider value={BOOT}>
        <NavigateProbe />
        <SidebarFromStore />
      </BootRegistryProvider>
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  let viewport: ReturnType<typeof stubViewport>;

  beforeEach(() => {
    viewport = stubViewport();
    useUIStore.setState({ sidebarOpen: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useUIStore.setState({ sidebarOpen: false });
  });

  it('renders nothing while closed', () => {
    useUIStore.setState({ sidebarOpen: false });
    renderSidebar();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("groups each app's pages under that app's name", () => {
    renderSidebar();
    const finance = screen.getByRole('region', { name: 'finance' });
    expect(within(finance).getAllByRole('link')).toHaveLength(2);
    const media = screen.getByRole('region', { name: 'media' });
    expect(within(media).getAllByRole('link')).toHaveLength(1);
  });

  it('reaches Settings, which nothing else offers below md', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'settings' })).toHaveAttribute('href', '/settings');
  });

  it('scrolls its page list inside the drawer rather than running off-screen', () => {
    renderSidebar();
    const nav = within(screen.getByRole('dialog')).getByRole('navigation');
    expect(nav).toHaveClass('overflow-y-auto', 'min-h-0', 'flex-1');
  });

  it('closes on Escape', () => {
    renderSidebar();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it('closes when the route changes from outside the drawer', () => {
    renderSidebar();
    act(() => navigateTo('/media'));
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays open through a redirect, which the user did not ask for', () => {
    renderSidebar();
    act(() => navigateTo('/media', { replace: true }));
    expect(useUIStore.getState().sidebarOpen).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes when the viewport grows past md, where it is hidden', () => {
    renderSidebar();
    act(() => viewport.growToDesktop());
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it('locks page scroll only while open', () => {
    renderSidebar();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    act(() => useUIStore.getState().setSidebarOpen(false));
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });
});
