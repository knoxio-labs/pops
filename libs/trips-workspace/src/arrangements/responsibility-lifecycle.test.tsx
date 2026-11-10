import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deferredRouteResponse, routeJson, routeTransport } from '../route/test-utils';
import { client as defaultClient } from '../trips-api/client.gen';
import { ResponsibilitySessions } from './ResponsibilitySessions';
import { labels } from './test-utils';
import { useResponsibility } from './use-responsibility';

import type { ReactNode } from 'react';

import type { ContactChooserIntent } from '@pops/pillar-sdk';

import type { ArrangementResponsibilityContext } from './responsibility-context';
import type { ArrangementResponsibility } from './types';

const source: ArrangementResponsibility = {
  tripId: 7,
  targetKind: 'rental',
  targetId: 61,
  revision: 4,
  responsibility: null,
};
const contact = { kind: 'contact', uri: 'pops:contacts/contact/owner-issued' } as const;
const confirmed = { ...source, revision: 5, responsibility: contact };
const picker: ContactChooserIntent = { Chooser: () => null };
afterEach(cleanup);
function setup(initial: ArrangementResponsibilityContext) {
  let identity = initial;
  let visible = true;
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderHook(
    () => {
      const first = useResponsibility(identity, source);
      const second = useResponsibility(identity, source);
      return { first, second };
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode>
          <QueryClientProvider client={cache}>
            <ResponsibilitySessions identity={identity}>
              {visible ? children : null}
            </ResponsibilitySessions>
          </QueryClientProvider>
        </StrictMode>
      ),
    }
  );
  return {
    ...view,
    cache,
    context(next: ArrangementResponsibilityContext): void {
      identity = next;
      view.rerender();
    },
    visible(next: boolean): void {
      visible = next;
      view.rerender();
    },
  };
}

describe('Contextual responsibility lifetime', () => {
  it('retains a late own A receipt dormant under B, then delivers its picker once after A returns', async () => {
    const a = routeTransport();
    const b = routeTransport();
    const pending = deferredRouteResponse();
    a.replies.push(
      () => routeJson(source),
      () => pending.promise,
      () => routeJson(confirmed)
    );
    b.replies.push(() => routeJson(source));
    const advanceA = vi.fn();
    const advanceB = vi.fn();
    const identityA = {
      tripId: 7,
      client: a.client,
      labels,
      advanceContactChooserIntent: advanceA,
    };
    const identityB = { ...identityA, client: b.client, advanceContactChooserIntent: advanceB };
    const view = setup(identityA);
    await waitFor(() => expect(view.result.current.first.query.isSuccess).toBe(true));
    let saving: Promise<void> | undefined;
    act(() => {
      saving = view.result.current.first.save(source, contact, picker);
    });
    await act(async () => {
      await view.result.current.second.save(source, contact, picker);
    });
    expect(a.requests.filter((request) => request.method === 'PUT')).toHaveLength(1);
    view.context(identityB);
    await waitFor(() => expect(view.result.current.first.query.isSuccess).toBe(true));
    await act(async () => {
      pending.resolve(routeJson(confirmed));
      await saving;
    });
    expect(advanceA).not.toHaveBeenCalled();
    expect(advanceB).not.toHaveBeenCalled();
    expect(view.result.current.first.query.data).toEqual(source);
    view.context(identityA);
    await waitFor(() => expect(advanceA).toHaveBeenCalledExactlyOnceWith(source, picker));
    expect(advanceB).not.toHaveBeenCalled();
    view.visible(false);
    view.visible(true);
    await waitFor(() => expect(view.result.current.first.query.isFetching).toBe(false));
    expect(advanceA).toHaveBeenCalledTimes(1);
  });

  it('keeps unknown PUT and exact retry through a keyed field remount and cache eviction', async () => {
    const a = routeTransport();
    a.replies.push(
      () => routeJson(source),
      () =>
        routeJson({ code: 'trips.response_lost', message: 'Response lost', retryable: true }, 503),
      () => routeJson(confirmed),
      () => routeJson(confirmed)
    );
    const advance = vi.fn();
    const identity = { tripId: 7, client: a.client, labels, advanceContactChooserIntent: advance };
    const view = setup(identity);
    await waitFor(() => expect(view.result.current.first.query.isSuccess).toBe(true));
    await act(async () => {
      await view.result.current.first.save(source, contact, picker);
    });
    view.visible(false);
    view.cache.clear();
    view.visible(true);
    await waitFor(() => expect(view.result.current.first.query.data).toEqual(confirmed));
    expect(view.result.current.first.failure?.write).toEqual({ source, value: contact, picker });
    expect(advance).not.toHaveBeenCalled();
    await act(async () => {
      await view.result.current.second.save(confirmed, null);
    });
    expect(a.requests.filter((request) => request.method === 'PUT')).toHaveLength(1);
    await act(async () => {
      await view.result.current.first.retry();
    });
    const writes = a.requests.filter((request) => request.method === 'PUT');
    expect(writes).toHaveLength(2);
    expect(await writes[1]?.json()).toEqual(await writes[0]?.json());
    expect(advance).toHaveBeenCalledExactlyOnceWith(source, picker);
  });

  it('guards default-client reads, writes and exact retry when its mutable origin changes', async () => {
    const original = defaultClient.getConfig();
    const owner = routeTransport();
    defaultClient.setConfig(owner.client.getConfig());
    try {
      owner.replies.push(
        () => routeJson(source),
        () =>
          routeJson(
            { code: 'trips.response_lost', message: 'Response lost', retryable: true },
            503
          ),
        () => routeJson(confirmed)
      );
      const view = setup({ tripId: 7, labels });
      await waitFor(() => expect(view.result.current.first.query.isSuccess).toBe(true));
      defaultClient.setConfig({ baseUrl: 'http://foreign.test' });
      await act(async () => {
        await view.result.current.first.reload();
        await view.result.current.first.save(source, contact);
      });
      expect(owner.requests).toHaveLength(1);
      defaultClient.setConfig({ baseUrl: 'http://routes.test' });
      await act(async () => {
        await view.result.current.first.save(source, contact);
      });
      expect(view.result.current.first.failure).toBeDefined();
      defaultClient.setConfig({ baseUrl: 'http://foreign.test' });
      await act(async () => {
        await view.result.current.first.retry();
      });
      expect(owner.requests).toHaveLength(2);
      defaultClient.setConfig({ baseUrl: 'http://routes.test' });
      await act(async () => {
        await view.result.current.first.retry();
      });
      expect(owner.requests).toHaveLength(3);
      expect(
        owner.requests.every((request) => new URL(request.url).origin === 'http://routes.test')
      ).toBe(true);
      expect(view.result.current.first.failure).toBeUndefined();
    } finally {
      defaultClient.setConfig(original);
    }
  });
});
