import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deferredRouteResponse, routeJson, routeTransport } from '../route/test-utils';
import { client as defaultClient } from '../trips-api/client.gen';
import { labels, sourceRental } from './test-utils';
import { useRentalEditor } from './use-rental-editor';

import type { ReactNode } from 'react';

import type { Rental } from './types';

const initial = sourceRental();
function setup() {
  const transport = routeTransport();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const identity = {
    tripId: 7,
    client: transport.client,
    labels,
    formatDate: (value: string) => value,
  };
  const saved = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    </StrictMode>
  );
  const mount = (source = initial) =>
    renderHook(({ current }) => useRentalEditor(identity, current, saved), {
      wrapper,
      initialProps: { current: source },
    });
  return { ...transport, identity, cache, saved, mount };
}
afterEach(cleanup);

describe('Retained canonical Rental editor', () => {
  it('retains an unsaved source draft across unmount and query-cache eviction', () => {
    const owner = setup();
    const first = owner.mount();
    act(() =>
      first.result.current.setDraft({ ...first.result.current.draft, provider: 'Retained draft' })
    );
    first.unmount();
    owner.cache.clear();
    const second = owner.mount();
    expect(second.result.current.draft.provider).toBe('Retained draft');
    expect(second.result.current.dirty).toBe(true);
    expect(owner.requests).toEqual([]);
  });

  it('claims one PATCH across two mounted views and preserves its late receipt and Undo after both unmount', async () => {
    const owner = setup();
    const pending = deferredRouteResponse();
    owner.replies.push(
      () => pending.promise,
      () => routeJson(sourceRental({ revision: 2 }))
    );
    const first = owner.mount();
    const second = owner.mount({ ...initial });
    const body = { provider: 'Known own change', expectedRevision: 0 };
    let saving: Promise<void> | undefined;
    act(() => {
      saving = first.result.current.run(body);
    });
    await act(async () => {
      await second.result.current.run(body);
    });
    expect(owner.requests).toHaveLength(1);
    first.unmount();
    expect(second.result.current.busy).toBe(true);
    second.unmount();
    await act(async () => {
      pending.resolve(routeJson(sourceRental({ provider: 'Known own change', revision: 1 })));
      await saving;
    });
    expect(owner.saved).not.toHaveBeenCalled();
    const reopened = owner.mount();
    expect(reopened.result.current.confirmed.revision).toBe(1);
    expect(reopened.result.current.draft.provider).toBe('Known own change');
    expect(reopened.result.current.inverse?.provider).toBe(initial.provider);
  });

  it('retains an unknown original PATCH despite a matching foreign GET on remount', async () => {
    const owner = setup();
    owner.replies.push(
      () =>
        routeJson(
          { code: 'trips.rental.unavailable', message: 'Response lost', retryable: true },
          503
        ),
      () => routeJson(sourceRental({ provider: 'Chosen provider', revision: 1 }))
    );
    const first = owner.mount();
    const body = { provider: 'Chosen provider', expectedRevision: 0 };
    await act(async () => {
      await first.result.current.run(body);
    });
    first.unmount();
    owner.cache.clear();
    const second = owner.mount(sourceRental({ provider: 'Chosen provider', revision: 1 }));
    expect(second.result.current.failure?.body).toEqual(body);
    expect(second.result.current.inverse).toBeUndefined();
    expect(second.result.current.confirmed.revision).toBe(0);
    expect(owner.saved).not.toHaveBeenCalled();
    await act(async () => {
      await second.result.current.run(body);
    });
    expect(owner.requests).toHaveLength(2);
    expect(await owner.requests[1]?.json()).toEqual(await owner.requests[0]?.json());
    expect(second.result.current.failure).toBeUndefined();
  });

  it('blocks stale-origin commands while preserving the original draft for a return to its owner', async () => {
    const owner = setup();
    const first = owner.mount();
    act(() =>
      first.result.current.setDraft({
        ...first.result.current.draft,
        provider: 'Original owner draft',
      })
    );
    owner.client.setConfig({ baseUrl: 'http://other.test' });
    await act(async () => {
      await first.result.current.run({ provider: 'Wrong origin', expectedRevision: 0 });
    });
    expect(owner.requests).toEqual([]);
    first.unmount();
    owner.client.setConfig({ baseUrl: 'http://routes.test' });
    const second = owner.mount();
    expect(second.result.current.draft.provider).toBe('Original owner draft');
  });

  it('retains a late A receipt without replacing B drafts or callbacks when one client changes origins', async () => {
    const owner = setup();
    const pending = deferredRouteResponse();
    owner.replies.push(() => pending.promise);
    const first = owner.mount();
    let saving: Promise<void> | undefined;
    act(() => {
      saving = first.result.current.run({ provider: 'Owner A', expectedRevision: 0 });
    });
    first.unmount();
    owner.client.setConfig({ baseUrl: 'http://other.test' });
    const second = owner.mount(sourceRental({ provider: 'Owner B' }));
    act(() =>
      second.result.current.setDraft({ ...second.result.current.draft, provider: 'B draft' })
    );
    await act(async () => {
      pending.resolve(routeJson(sourceRental({ provider: 'Owner A', revision: 1 })));
      await saving;
    });
    expect(second.result.current.draft.provider).toBe('B draft');
    expect(owner.saved).not.toHaveBeenCalled();
    second.unmount();
    owner.client.setConfig({ baseUrl: 'http://routes.test' });
    const returned = owner.mount();
    expect(returned.result.current.confirmed.revision).toBe(1);
    expect(returned.result.current.draft.provider).toBe('Owner A');
    expect(returned.result.current.inverse?.provider).toBe(initial.provider);
  });

  it('guards default-client exact retry and own Undo against a changed origin', async () => {
    const original = defaultClient.getConfig();
    const owner = setup();
    defaultClient.setConfig(owner.client.getConfig());
    try {
      owner.replies.push(
        () =>
          routeJson(
            { code: 'trips.rental.unavailable', message: 'Response lost', retryable: true },
            503
          ),
        () => routeJson(sourceRental({ provider: 'Owned', revision: 1 })),
        () => routeJson(sourceRental({ revision: 2 }))
      );
      const view = renderHook(() => useRentalEditor({ tripId: 7, labels }, initial, owner.saved), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={owner.cache}>{children}</QueryClientProvider>
        ),
      });
      await act(async () => {
        await view.result.current.run({ provider: 'Owned', expectedRevision: 0 });
      });
      const failure = view.result.current.failure;
      if (!failure) throw new Error('Expected an original unknown PATCH');
      failure.body.provider = 'Foreign replacement';
      failure.body.expectedRevision = 99;
      view.result.current.confirmed.revision = 99;
      defaultClient.setConfig({ baseUrl: 'http://other.test' });
      await act(async () => {
        await view.result.current.retry();
      });
      expect(owner.requests).toHaveLength(1);
      defaultClient.setConfig({ baseUrl: 'http://routes.test' });
      await act(async () => {
        await view.result.current.retry();
      });
      expect(await owner.requests[1]?.json()).toEqual(await owner.requests[0]?.json());
      defaultClient.setConfig({ baseUrl: 'http://other.test' });
      await act(async () => {
        await view.result.current.undo();
      });
      expect(owner.requests).toHaveLength(2);
      defaultClient.setConfig({ baseUrl: 'http://routes.test' });
      await act(async () => {
        await view.result.current.undo();
      });
      expect(owner.requests).toHaveLength(3);
      expect(await owner.requests[2]?.json()).toEqual({
        provider: initial.provider,
        pickupVisitId: initial.pickupVisitId,
        returnVisitId: initial.returnVisitId,
        start: initial.start,
        end: initial.end,
        status: initial.status,
        expectedRevision: 1,
      });
      expect(
        owner.requests.every((request) => new URL(request.url).origin === 'http://routes.test')
      ).toBe(true);
    } finally {
      defaultClient.setConfig(original);
    }
  });

  it.each([
    { status: 202, source: sourceRental({ revision: 1 }) },
    { status: 200, source: sourceRental({ id: 62, revision: 1 }) },
    { status: 200, source: sourceRental({ tripId: 8, revision: 1 }) },
    { status: 200, source: sourceRental({ revision: 3 }) },
    { status: 200, source: { ...sourceRental({ revision: 1 }), status: 'Agreed' } },
    { status: 200, source: { ...sourceRental({ revision: 1 }), uncontracted: true } },
  ])('does not establish own PATCH proof from an invalid receipt %j', async (reply) => {
    const owner = setup();
    owner.replies.push(() => routeJson(reply.source, reply.status));
    const view = owner.mount();
    await act(async () => {
      await view.result.current.run({ provider: 'Proposed', expectedRevision: 0 });
    });
    expect(view.result.current.failure).toBeDefined();
    expect(view.result.current.confirmed).toEqual(initial);
    expect(view.result.current.inverse).toBeUndefined();
    expect(owner.saved).not.toHaveBeenCalled();
  });

  it('never treats a canonical reload during a rejected local command as its own PATCH proof', async () => {
    const owner = setup();
    const view = owner.mount();
    await act(async () => {
      const rejected = view.result.current.run({ provider: 'Not sent', expectedRevision: 99 });
      view.result.current.discard(
        sourceRental({ provider: 'Foreign current source', revision: 1 })
      );
      await rejected;
    });
    expect(owner.requests).toEqual([]);
    expect(owner.saved).not.toHaveBeenCalled();
    expect(view.result.current.inverse).toBeUndefined();
  });

  it('keeps revision conflicts explicit and admits only equal or newer canonical reloads', () => {
    const owner = setup();
    const view = owner.mount(sourceRental({ revision: 2 }));
    act(() =>
      view.result.current.setDraft({ ...view.result.current.draft, provider: 'Local draft' })
    );
    view.rerender({ current: sourceRental({ provider: 'New canonical', revision: 3 }) });
    expect(view.result.current.changed).toBe(true);
    expect(view.result.current.draft.provider).toBe('Local draft');
    act(() => view.result.current.discard(sourceRental({ provider: 'Older', revision: 1 })));
    expect(view.result.current.draft.provider).toBe('Local draft');
    act(() =>
      view.result.current.discard(sourceRental({ provider: 'New canonical', revision: 3 }))
    );
    expect(view.result.current.confirmed.revision).toBe(3);
    expect(view.result.current.draft.provider).toBe('New canonical');
    expect(view.result.current.dirty).toBe(false);
    const equal: Rental = sourceRental({ provider: 'Same current', revision: 3 });
    act(() => view.result.current.discard(equal));
    expect(view.result.current.confirmed).toEqual(equal);
  });
});
