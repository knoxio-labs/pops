import { QueryClient } from '@tanstack/react-query';
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

it('retains the opaque When draft through close, remount and query-cache eviction', () => {
  const first = mountMetadata(server);
  const when = '  after winter,\nperhaps  ';
  act(() => first.result.current.change({ ...first.result.current.draft, when }));
  first.unmount();
  first.cache.clear();
  const reopened = mountMetadata(server, first.cache);
  expect(reopened.result.current.draft.when).toBe(when);
  expect(reopened.result.current.dirty).toBe(true);
  const separate = mountMetadata(server, new QueryClient());
  expect(separate.result.current.draft.when).toBe(metadataTrip.when);
});

it('retains confirmed own Undo after remount without changing source-link ownership', async () => {
  const first = mountMetadata(server);
  act(() => first.result.current.change({ ...first.result.current.draft, when: '  whenever  ' }));
  await act(() => first.result.current.save());
  expect(first.result.current.canUndo).toBe(true);
  first.unmount();
  first.cache.clear();
  const reopened = mountMetadata(server, first.cache, server.current());
  expect(reopened.result.current.canUndo).toBe(true);
  await act(() => reopened.result.current.undo());
  expect(server.current()).toEqual(metadataTrip);
  expect(reopened.result.current.canUndo).toBe(false);
  expect(server.requests.filter((request) => request.method === 'PATCH')).toHaveLength(2);
});

it('keeps a server-committed lost PATCH as unknown and retries its immutable body after later edits/remount', async () => {
  const first = mountMetadata(server);
  act(() =>
    first.result.current.change({ ...first.result.current.draft, when: '  uncertain season  ' })
  );
  server.lose();
  await act(() => first.result.current.save());
  expect(first.result.current.failure).toBeDefined();
  act(() =>
    first.result.current.change({ ...first.result.current.draft, notes: 'Later unsaved note' })
  );
  first.unmount();
  first.cache.clear();
  const reopened = mountMetadata(server, first.cache, server.current());
  expect(reopened.result.current.failure).toBeDefined();
  expect(reopened.result.current.canUndo).toBe(false);
  await act(() => reopened.result.current.retry());
  const writes = server.requests.filter((request) => request.method === 'PATCH');
  expect(writes).toHaveLength(2);
  expect(writes[1]?.body).toBe(writes[0]?.body);
  expect(reopened.result.current.draft.notes).toBe('Later unsaved note');
  act(() => reopened.result.current.discard());
  expect(reopened.result.current.canUndo).toBe(true);
  await act(() => reopened.result.current.undo());
  expect(server.current()).toEqual(metadataTrip);
});

it('serializes two mounted views and settles an already dispatched save after its view closes', async () => {
  const first = mountMetadata(server);
  const second = mountMetadata(server, first.cache);
  act(() => first.result.current.change({ ...first.result.current.draft, name: 'Shared edit' }));
  expect(second.result.current.draft.name).toBe('Shared edit');
  const release = server.hold();
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = first.result.current.save();
  });
  await waitFor(() =>
    expect(server.requests.filter((request) => request.method === 'PATCH')).toHaveLength(1)
  );
  await act(() => second.result.current.save());
  first.unmount();
  await act(async () => {
    release();
    await pending;
  });
  expect(second.result.current.canUndo).toBe(true);
  expect(server.requests.filter((request) => request.method === 'PATCH')).toHaveLength(1);
});

it('retains an uncertain own Undo across remount and retries its original inverse after later draft edits', async () => {
  const first = mountMetadata(server);
  act(() => first.result.current.change({ ...first.result.current.draft, name: 'Confirmed' }));
  await act(() => first.result.current.save());
  server.lose();
  await act(() => first.result.current.undo());
  expect(first.result.current.failure?.undo?.name).toBe('Original');
  expect(first.result.current.previous.name).toBe('Confirmed');
  act(() =>
    first.result.current.change({ ...first.result.current.draft, notes: 'After failed Undo' })
  );
  first.unmount();
  first.cache.clear();
  const reopened = mountMetadata(server, first.cache, server.current());
  expect(reopened.result.current.failure?.undo?.name).toBe('Original');
  await act(() => reopened.result.current.retry());
  const writes = server.requests.filter((request) => request.method === 'PATCH');
  expect(writes[2]?.body).toBe(writes[1]?.body);
  expect(server.current()).toEqual(metadataTrip);
  expect(reopened.result.current.draft.notes).toBe('After failed Undo');
  act(() => reopened.result.current.discard());
  expect(reopened.result.current.canUndo).toBe(false);
});
