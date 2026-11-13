import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import {
  creationGate,
  creationReply,
  creationSession,
  creationTransport,
  mountCreation,
} from './create-trip-test-utils';
import { metadataTrip } from './metadata-test-utils';
import { tripDraft } from './model';

afterEach(cleanup);

it('retains the exact unknown UUID/body through Close, cache eviction and remount, without automatic retries', async () => {
  const transport = creationTransport();
  const created = vi.fn();
  const first = mountCreation(transport, created);
  act(() => first.result.current.change(tripDraft(metadataTrip)));
  transport.respond(async () => {
    throw new TypeError('Lost after commit');
  });
  act(() => first.result.current.create());
  await waitFor(() => expect(first.result.current.error).toBeDefined());
  expect(transport.requests).toHaveLength(1);
  expect(first.result.current.locked).toBe(true);
  act(() => first.result.current.cancel());
  first.rerender({ open: false });
  first.unmount();
  first.cache.clear();
  const reopened = mountCreation(transport, created, first.cache);
  expect(reopened.result.current.draft.when).toBe(metadataTrip.when);
  expect(reopened.result.current.locked).toBe(true);
  transport.respond((request) => creationReply(request, metadataTrip, metadataTrip, true));
  act(() => reopened.result.current.retry());
  await waitFor(() => expect(created).toHaveBeenCalledExactlyOnceWith(metadataTrip));
  expect(transport.requests).toHaveLength(2);
  expect(transport.requests[1]).toEqual(transport.requests[0]);
  expect(reopened.cache.getQueryData(['trips', 'http://owner-a.test', metadataTrip.id])).toEqual(
    metadataTrip
  );
});

it('rejects mutable A→B retry and stale view handlers, then recovers only the original A command', async () => {
  const transport = creationTransport();
  const created = vi.fn();
  const first = mountCreation(transport, created);
  act(() => first.result.current.change(tripDraft(metadataTrip)));
  transport.reject('trips.test.unavailable', 503);
  act(() => first.result.current.create());
  await waitFor(() => expect(first.result.current.error).toBeDefined());
  const staleRetry = first.result.current.retry;
  transport.client.setConfig({ baseUrl: 'http://owner-b.test' });
  act(() => first.result.current.retry());
  expect(transport.requests).toHaveLength(1);
  first.unmount();
  const second = mountCreation(transport, created, first.cache);
  act(() => second.result.current.change({ ...tripDraft(), name: 'Owner B draft' }));
  transport.client.setConfig({ baseUrl: 'http://owner-a.test' });
  act(staleRetry);
  act(() => second.result.current.retry());
  expect(transport.requests).toHaveLength(1);
  const reopened = mountCreation(transport, created, first.cache);
  transport.respond((request) => creationReply(request));
  act(() => reopened.result.current.retry());
  await waitFor(() => expect(created).toHaveBeenCalledExactlyOnceWith(metadataTrip));
  expect(transport.requests[1]).toEqual(transport.requests[0]);
  expect(
    first.cache.getQueryData(['trips', 'http://owner-b.test', metadataTrip.id])
  ).toBeUndefined();
});

it('retains an accepted late receipt while closed/retargeted, without cache admission or navigation until A reopens', async () => {
  const transport = creationTransport();
  const created = vi.fn();
  const first = mountCreation(transport, created);
  act(() => first.result.current.change(tripDraft(metadataTrip)));
  const gate = creationGate();
  const originalSession = creationSession(transport, first.cache);
  transport.respond(async (request) => {
    await gate.wait;
    return creationReply(request);
  });
  act(() => first.result.current.create());
  await waitFor(() => expect(transport.requests).toHaveLength(1));
  first.rerender({ open: false });
  transport.client.setConfig({ baseUrl: 'http://owner-b.test' });
  const second = mountCreation(transport, created, first.cache);
  act(() => second.result.current.change({ ...tripDraft(), name: 'B untouched' }));
  await act(async () => {
    gate.release();
  });
  await waitFor(() => expect(originalSession.snapshot().confirmed).toBe(true));
  expect(creationSession(transport, first.cache).snapshot().draft.name).toBe('B untouched');
  expect(created).not.toHaveBeenCalled();
  expect(
    first.cache.getQueryData(['trips', 'http://owner-a.test', metadataTrip.id])
  ).toBeUndefined();
  expect(
    first.cache.getQueryData(['trips', 'http://owner-b.test', metadataTrip.id])
  ).toBeUndefined();
  transport.client.setConfig({ baseUrl: 'http://owner-a.test' });
  const reopened = mountCreation(transport, created, first.cache);
  await waitFor(() => expect(created).toHaveBeenCalledExactlyOnceWith(metadataTrip));
  expect(transport.requests).toHaveLength(1);
  expect(reopened.result.current.draft.name).toBe('');
});

it('serializes overlapping views and delivers a receipt once while preserving a genuinely newer draft', async () => {
  const transport = creationTransport();
  const firstCreated = vi.fn();
  const secondCreated = vi.fn();
  const first = mountCreation(transport, firstCreated);
  const second = mountCreation(transport, secondCreated, first.cache);
  act(() => first.result.current.change(tripDraft(metadataTrip)));
  const gate = creationGate();
  transport.respond(async (request) => {
    await gate.wait;
    return creationReply(request);
  });
  act(() => {
    first.result.current.create();
    second.result.current.create();
  });
  await waitFor(() => expect(transport.requests).toHaveLength(1));
  const session = creationSession(transport, first.cache);
  act(() =>
    session.change({ ...session.snapshot().draft, notes: 'Later separately retained draft' })
  );
  expect(second.result.current.draft.notes).toBe(metadataTrip.notes);
  await act(async () => {
    gate.release();
  });
  await waitFor(() =>
    expect(firstCreated.mock.calls.length + secondCreated.mock.calls.length).toBe(1)
  );
  expect(session.snapshot().draft.notes).toBe('Later separately retained draft');
  expect(transport.requests).toHaveLength(1);
});
