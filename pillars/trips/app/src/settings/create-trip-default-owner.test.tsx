import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { client as defaultClient } from '../trips-api/client.gen';
import { creationReply } from './create-trip-test-utils';
import { metadataTrip } from './metadata-test-utils';
import { tripDraft } from './model';
import { useCreateTrip } from './use-create-trip';

import type { ReactNode } from 'react';

it('captures the effective default client origin and retries only when that original default connection returns', async () => {
  const original = defaultClient.getConfig();
  const requests: { url: string; body: string }[] = [];
  const created = vi.fn();
  const cache = new QueryClient();
  let fail = true;
  defaultClient.setConfig({
    baseUrl: 'http://default-a.test',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push({ url: request.url, body: await request.clone().text() });
      if (fail) {
        fail = false;
        throw new TypeError('Lost response');
      }
      return creationReply(request);
    },
  });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  try {
    const first = renderHook(() => useCreateTrip({}, created, true), { wrapper });
    act(() => first.result.current.change(tripDraft(metadataTrip)));
    act(() => first.result.current.create());
    await waitFor(() => expect(first.result.current.error).toBeDefined());
    defaultClient.setConfig({ baseUrl: 'http://default-b.test' });
    act(() => first.result.current.retry());
    expect(requests).toHaveLength(1);
    first.unmount();
    defaultClient.setConfig({ baseUrl: 'http://default-a.test' });
    cache.clear();
    const reopened = renderHook(() => useCreateTrip({}, created, true), { wrapper });
    act(() => reopened.result.current.retry());
    await waitFor(() => expect(created).toHaveBeenCalledExactlyOnceWith(metadataTrip));
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
  } finally {
    cleanup();
    cache.clear();
    defaultClient.setConfig(original);
  }
});
