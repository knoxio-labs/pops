import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BootRegistryProvider } from '../../BootRegistryProvider';
import { synthesizeExternalBundleEntry, type RemoteModuleImporter } from '../../external-ui';
import { TopBarActions } from './TopBarActions';

import type { ReactNode } from 'react';

import type { BootRegistry } from '../../boot-snapshot';
import type { BundleEntry } from '../../bundle-entry';

function bootWith(bundleMap: Readonly<Record<string, BundleEntry>>): BootRegistry {
  return { manifests: [], registeredApps: [], remoteBundleUrls: [], bundleMap, source: 'registry' };
}

function renderActions(boot: BootRegistry): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <BootRegistryProvider value={boot}>{children}</BootRegistryProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  render(<TopBarActions onOpenMobileSearch={() => undefined} />, { wrapper });
}

describe('TopBarActions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders no pillar widget and fetches nothing when no pillar contributes one', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}', { status: 404 })));
    vi.stubGlobal('fetch', fetchSpy);

    renderActions(bootWith({}));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByRole('button', { name: /nudges/i })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders a registered pillar’s widget from its remote bundle, in rank order', async () => {
    const importer = vi.fn<RemoteModuleImporter>(() =>
      Promise.resolve({
        bundles: {
          home: () => null,
          'first-widget': () => <span>first widget</span>,
          'second-widget': () => <span>second widget</span>,
        },
      })
    );
    const entry = synthesizeExternalBundleEntry(
      {
        pillarId: 'acme',
        assetsBaseUrl: '/acme-ui/acme.js',
        pages: [{ path: '', index: true, bundleSlot: 'home' }],
        topBarWidgets: [
          { bundleSlot: 'second-widget', order: 20 },
          { bundleSlot: 'first-widget', order: 10 },
        ],
      },
      importer
    );
    if (entry === null) throw new Error('acme did not synthesize');

    renderActions(bootWith({ acme: entry }));

    const first = await screen.findByText('first widget');
    const second = await screen.findByText('second widget');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('imports no bundle for a registered pillar that contributes no widget', async () => {
    const importer = vi.fn<RemoteModuleImporter>(() => Promise.resolve({ bundles: {} }));
    const entry = synthesizeExternalBundleEntry(
      {
        pillarId: 'acme',
        assetsBaseUrl: '/acme-ui/acme.js',
        pages: [{ path: '', index: true, bundleSlot: 'home' }],
      },
      importer
    );
    if (entry === null) throw new Error('acme did not synthesize');

    renderActions(bootWith({ acme: entry }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(importer).not.toHaveBeenCalled();
  });
});
