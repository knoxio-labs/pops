import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router';
import { afterEach, expect, it } from 'vitest';

import { documentUploadHost } from './document-upload-authority';
import { synthesizeExternalBundleEntry } from './external-ui';
import { hasRoutes } from './installed-modules';

import type { RouteObject } from 'react-router';

import type { RemotePageHostProps } from '@pops/pillar-sdk';

afterEach(cleanup);
function Probe({ documentUploads }: RemotePageHostProps) {
  return (
    <p>
      {documentUploads === documentUploadHost
        ? 'Owner upload authority forwarded'
        : 'Missing upload authority'}
    </p>
  );
}
function Routes({ routes }: { routes: RouteObject[] }) {
  return useRoutes(routes);
}
it('forwards the single structural upload host through the actual remote page loader', async () => {
  const entry = synthesizeExternalBundleEntry(
    {
      pillarId: 'test',
      assetsBaseUrl: '/test-ui/test.js',
      pages: [{ path: '', index: true, bundleSlot: 'page' }],
    },
    async () => ({ bundles: { page: Probe } })
  );
  if (entry === null || !hasRoutes(entry.manifest)) throw new Error('Missing remote routes');
  render(
    <MemoryRouter>
      <Routes routes={entry.manifest.frontend.routes} />
    </MemoryRouter>
  );
  expect(await screen.findByText('Owner upload authority forwarded')).toBeVisible();
});
