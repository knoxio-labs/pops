import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { metadataServer, metadataTrip, mountMetadata } from './metadata-test-utils';

let server: Awaited<ReturnType<typeof metadataServer>>;
beforeEach(async () => {
  server = await metadataServer();
});
afterEach(async () => {
  cleanup();
  await server.close();
});

it('fences old and foreign-origin callbacks through A→B→A while preserving each retained draft', async () => {
  const first = mountMetadata(server);
  act(() => first.result.current.change({ ...first.result.current.draft, name: 'Draft A' }));
  const staleSave = first.result.current.save;
  server.client.setConfig({ baseUrl: `${server.origin}/b` });
  await act(() => first.result.current.save());
  expect(server.requests).toEqual([]);
  first.unmount();
  const second = mountMetadata(server, first.cache, server.current('b'));
  act(() => second.result.current.change({ ...second.result.current.draft, name: 'Draft B' }));
  server.client.setConfig({ baseUrl: `${server.origin}/a` });
  await act(async () => {
    await staleSave();
    await second.result.current.save();
  });
  expect(server.requests).toEqual([]);
  const reopened = mountMetadata(server, first.cache);
  expect(reopened.result.current.draft.name).toBe('Draft A');
  await act(() => reopened.result.current.save());
  expect(
    server.requests.filter((request) => request.method === 'PATCH').map((request) => request.path)
  ).toEqual(['/a/trips/7']);
  expect(reopened.result.current.canUndo).toBe(true);
});

it('does not deliver an A PATCH into B state or B cache, and retains its exact original retry', async () => {
  const first = mountMetadata(server);
  act(() => first.result.current.change({ ...first.result.current.draft, name: 'Pending A' }));
  const release = server.hold();
  let pending = Promise.resolve();
  act(() => {
    pending = first.result.current.save();
  });
  await waitFor(() => expect(server.requests).toHaveLength(1));
  first.unmount();
  server.client.setConfig({ baseUrl: `${server.origin}/b` });
  const second = mountMetadata(server, first.cache, server.current('b'));
  await act(async () => {
    release();
    await pending;
  });
  expect(second.result.current.draft.name).toBe('Owner B');
  expect(second.result.current.canUndo).toBe(false);
  expect(first.cache.getQueryData(['trips', `${server.origin}/b`, 7])).toBeUndefined();
  second.unmount();
  server.client.setConfig({ baseUrl: `${server.origin}/a` });
  const reopened = mountMetadata(server, first.cache);
  expect(reopened.result.current.failure).toBeDefined();
  await act(() => reopened.result.current.retry());
  expect(server.requests[1]?.body).toBe(server.requests[0]?.body);
  expect(reopened.result.current.canUndo).toBe(true);
});

it.each([
  { ...metadataTrip, id: 8 },
  { ...metadataTrip, name: 'Wrong submitted fields' },
  { id: 7 },
])(
  'does not establish history or cache proof from a foreign, mismatched or malformed success %j',
  async (response) => {
    const view = mountMetadata(server);
    act(() => view.result.current.change({ ...view.result.current.draft, name: 'Requested' }));
    server.reply(response);
    await act(() => view.result.current.save());
    expect(view.result.current.failure).toBeDefined();
    expect(view.result.current.canUndo).toBe(false);
    expect(view.result.current.previous.name).toBe('Original');
    expect(view.cache.getQueryData(['trips', `${server.origin}/a`, 7])).toBeUndefined();
    await act(() => view.result.current.retry());
    expect(view.result.current.canUndo).toBe(true);
    expect(view.cache.getQueryData(['trips', `${server.origin}/a`, 7])).toEqual(server.current());
  }
);
