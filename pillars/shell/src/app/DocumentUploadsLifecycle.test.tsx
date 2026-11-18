import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createClient } from '../registry-api/client';
import { createDocumentUploadHost } from './document-upload-host';
import { DocumentUploadsLifecycle } from './DocumentUploadsLifecycle';

import type { SessionGetResponses } from '../registry-api/types.gen';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function fixture(fail = false) {
  const requests: Request[] = [];
  const session: SessionGetResponses[200] = { email: 'lifecycle@example.test', kind: 'operator' };
  const fetcher: typeof globalThis.fetch = async (resource, init) => {
    requests.push(new Request(resource, init));
    if (fail) throw new Error('Upstream connection failed.');
    return Response.json(session);
  };
  const client = createClient({ baseUrl: 'https://lifecycle.test/registry-api', fetch: fetcher });
  return {
    requests,
    host: createDocumentUploadHost({
      server: 'https://lifecycle.test',
      client,
      storage: () => window.localStorage,
    }),
  };
}

it('freshly verifies startup, focus and pageshow through the actual Registry client', async () => {
  const owner = fixture();
  const view = render(<DocumentUploadsLifecycle host={owner.host} />);
  await waitFor(() => expect(owner.requests).toHaveLength(1));
  await waitFor(() => expect(owner.host.current()).not.toBeNull());
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(owner.requests).toHaveLength(2));
  await waitFor(() => expect(owner.host.current()).not.toBeNull());
  act(() => {
    window.dispatchEvent(new Event('pageshow'));
  });
  await waitFor(() => expect(owner.requests).toHaveLength(3));
  await waitFor(() => expect(owner.host.current()).not.toBeNull());
  expect(
    owner.requests.every((request) => request.url === 'https://lifecycle.test/registry-api/session')
  ).toBe(true);
  expect(owner.requests.every((request) => request.redirect === 'error')).toBe(true);
  view.unmount();
  act(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
  });
  expect(owner.requests).toHaveLength(3);
});

it('forwards actual storage events and removes its storage listener on unmount', async () => {
  const owner = fixture();
  const handle = vi.spyOn(owner.host, 'handleStorageEvent');
  const view = render(<DocumentUploadsLifecycle host={owner.host} />);
  await waitFor(() => expect(owner.host.current()).not.toBeNull());
  const event = new StorageEvent('storage', {
    key: 'unrelated-storage-key',
    newValue: 'unrelated value',
    storageArea: window.localStorage,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  expect(handle).toHaveBeenCalledTimes(1);
  expect(handle).toHaveBeenCalledWith(event);
  view.unmount();
  act(() => {
    window.dispatchEvent(event);
  });
  expect(handle).toHaveBeenCalledTimes(1);
});

it('handles rejected lifecycle verification without an unhandled promise and retains the observable host problem', async () => {
  const owner = fixture(true);
  const unhandled = vi.fn();
  window.addEventListener('unhandledrejection', unhandled);
  try {
    const view = render(<DocumentUploadsLifecycle host={owner.host} />);
    await waitFor(() => expect(owner.host.problem()).not.toBeNull());
    expect(owner.host.current()).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('pageshow'));
    });
    await waitFor(() => expect(owner.requests).toHaveLength(3));
    await waitFor(() => expect(owner.host.problem()).not.toBeNull());
    expect(owner.host.current()).toBeNull();
    expect(unhandled).not.toHaveBeenCalled();
    view.unmount();
  } finally {
    window.removeEventListener('unhandledrejection', unhandled);
  }
});
