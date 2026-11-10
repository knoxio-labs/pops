import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router';
import { afterEach, expect, it } from 'vitest';

import { synthesizeExternalBundleEntry } from './external-ui';
import { hasRoutes } from './installed-modules';

import type { RouteObject } from 'react-router';

import type { RemotePageHostProps } from '@pops/pillar-sdk';

afterEach(cleanup);

function HostProbe({ contacts }: RemotePageHostProps) {
  return (
    <p>
      {typeof contacts?.createIntent === 'function' ? 'Contacts host available' : 'Missing host'}
      {typeof contacts?.readContactReference === 'function'
        ? 'Owner reader available'
        : 'Missing reader'}
    </p>
  );
}
function Routes({ routes }: { routes: RouteObject[] }) {
  return useRoutes(routes);
}

it('forwards the structural host capability through actual remote page composition', async () => {
  const entry = synthesizeExternalBundleEntry(
    {
      pillarId: 'test',
      assetsBaseUrl: '/test-ui/test.js',
      pages: [{ path: '', index: true, bundleSlot: 'page' }],
    },
    async () => ({ bundles: { page: HostProbe } })
  );
  if (!entry || !hasRoutes(entry.manifest)) throw new Error('Missing remote routes');
  render(
    <MemoryRouter>
      <Routes routes={entry.manifest.frontend.routes} />
    </MemoryRouter>
  );
  expect(await screen.findByText('Contacts host availableOwner reader available')).toBeVisible();
});
