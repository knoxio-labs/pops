import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { metadataServer, metadataTrip, mountMetadata } from './metadata-test-utils';
import { useTripEditor } from './use-trip-editor';

import type { ReactNode } from 'react';

let server: Awaited<ReturnType<typeof metadataServer>>;
const defaultConfig = defaultClient.getConfig();
beforeEach(async () => {
  server = await metadataServer();
});
afterEach(async () => {
  cleanup();
  defaultClient.setConfig(defaultConfig);
  await server.close();
});

it('shares default and explicit actual app transport, but isolates another transport at the same origin and another trip', () => {
  const cache = new QueryClient();
  defaultClient.setConfig({ baseUrl: `${server.origin}/a` });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const implicit = renderHook(() => useTripEditor(metadataTrip, {}), { wrapper });
  act(() =>
    implicit.result.current.change({
      ...implicit.result.current.draft,
      when: 'Default-owner draft',
    })
  );
  const explicit = renderHook(() => useTripEditor(metadataTrip, { tripClient: defaultClient }), {
    wrapper,
  });
  expect(explicit.result.current.draft.when).toBe('Default-owner draft');
  const otherClient = createClient({ baseUrl: `${server.origin}/a` });
  const other = mountMetadata({ ...server, client: otherClient }, cache);
  expect(other.result.current.draft.when).toBe(metadataTrip.when);
  const otherTrip = renderHook(
    () => useTripEditor({ ...metadataTrip, id: 8 }, { tripClient: defaultClient }),
    { wrapper }
  );
  expect(otherTrip.result.current.draft.when).toBe(metadataTrip.when);
  implicit.unmount();
  explicit.unmount();
  const reopened = renderHook(() => useTripEditor(metadataTrip, {}), { wrapper });
  expect(reopened.result.current.draft.when).toBe('Default-owner draft');
});
