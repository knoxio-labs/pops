import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { loadTrip } from '../api/source';
import { metadataServer, metadataTrip, mountMetadata } from './metadata-test-utils';
import { tripDraft } from './model';

let server: Awaited<ReturnType<typeof metadataServer>>;
beforeEach(async () => {
  server = await metadataServer();
});
afterEach(async () => {
  cleanup();
  await server.close();
});

it.each([201, 202])(
  'does not accept HTTP %i as a canonical GET acknowledgement',
  async (status) => {
    server.status(status);
    await expect(loadTrip(7, { tripClient: server.client })).rejects.toThrow();
    await expect(loadTrip(7, { tripClient: server.client })).resolves.toEqual(metadataTrip);
  }
);

it.each([201, 202])(
  'retains the exact uncertain PATCH after HTTP %i without creating own history',
  async (status) => {
    const editor = mountMetadata(server);
    act(() => editor.result.current.change({ ...editor.result.current.draft, name: 'Requested' }));
    server.status(status);
    await act(() => editor.result.current.save());
    expect(server.current().name).toBe('Requested');
    expect(editor.result.current.failure).toBeDefined();
    expect(editor.result.current.canUndo).toBe(false);
    expect(editor.result.current.previous).toEqual(tripDraft(metadataTrip));
    expect(editor.cache.getQueryData(['trips', `${server.origin}/a`, 7])).toBeUndefined();
    await act(() => editor.result.current.retry());
    expect(server.requests[1]?.body).toBe(server.requests[0]?.body);
    expect(editor.result.current.canUndo).toBe(true);
  }
);
