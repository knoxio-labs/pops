import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { ApiError } from '@pops/pillar-sdk/client';

import { loadPlaces, loadVisits } from '../stay/api';
import { createClient } from '../trips-api/client';
import { loadCaptureSource, performCaptureRequest } from './api';
import { findCaptureSession } from './browser-session';
import { CaptureMembershipContext } from './CaptureMembershipContext';
import { CaptureWorkspace } from './CaptureWorkspace';
import { captureResult, captureSource, sourceEvent, sourceIdea } from './test-utils';

import type { CaptureSource } from './types';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  loadCaptureSource: vi.fn(),
  performCaptureRequest: vi.fn(),
}));
vi.mock('../stay/api', async (original) => ({
  ...(await original<typeof import('../stay/api')>()),
  loadPlaces: vi.fn(),
  loadVisits: vi.fn(),
}));
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.resetAllMocks();
});

it('recovers a retained Idea conflict from its Event membership context through the same guarded owner before explicit row discard', async () => {
  const client = createClient({ baseUrl: 'http://owner-a.test' });
  const identity = { tripId: 1, client };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const membership: CaptureSource['memberships'][number] = {
    id: 41,
    tripId: 1,
    source: { kind: 'event', id: 3 },
    revision: 9,
    removedAt: null,
    createdAt: '',
    updatedAt: '',
  };
  let current: CaptureSource = {
    ...captureSource(),
    ideas: [sourceIdea({ id: 7 })],
    events: [sourceEvent({ id: 3, visitId: null })],
    memberships: [membership],
  };
  vi.mocked(loadCaptureSource).mockImplementation(async () => current);
  vi.mocked(loadPlaces).mockResolvedValue([]);
  vi.mocked(loadVisits).mockResolvedValue([]);
  vi.mocked(performCaptureRequest)
    .mockRejectedValueOnce(
      new ApiError({
        code: 'trips.source.source_revision_conflict',
        kind: 'client',
        status: 409,
        message: 'Changed elsewhere',
        retryable: false,
      })
    )
    .mockImplementation(async (_, request) => {
      current = {
        ...current,
        ideas: [sourceIdea({ id: 7, revision: 4, notes: 'New explicit note' })],
      };
      return captureResult(request, current);
    });
  const idea = () =>
    render(
      <QueryClientProvider client={cache}>
        <CaptureWorkspace {...identity} view="capture" selectedSource={{ kind: 'idea', id: 7 }} />
      </QueryClientProvider>
    );
  const first = idea();
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole('textbox', { name: 'Idea notes' }),
    'Retained local note'
  );
  await user.tab();
  await screen.findByRole('region', { name: 'Edit Idea failed' });
  first.unmount();
  const event = render(
    <QueryClientProvider client={cache}>
      <CaptureMembershipContext {...identity} source={{ kind: 'event', id: 3 }} />
    </QueryClientProvider>
  );
  const session = findCaptureSession(cache, identity);
  if (!session) throw new Error('Missing shared source session');
  await screen.findByRole('button', { name: 'Reload source' });
  await waitFor(() => expect(cache.isFetching()).toBe(0));
  const reads = vi.mocked(loadCaptureSource).mock.calls.length;
  client.setConfig({ baseUrl: 'http://owner-b.test' });
  await user.click(screen.getByRole('button', { name: 'Reload source' }));
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name: 'Edit Idea failed' })).getByText(
        'Restore the original Trips owner before retrying this operation.'
      )
    ).toBeVisible()
  );
  expect(loadCaptureSource).toHaveBeenCalledTimes(reads);
  expect(session.editor.canDiscardRejectedEdit('idea', 7)).toBe(false);
  client.setConfig({ baseUrl: 'http://owner-a.test' });
  current = { ...current, ideas: [sourceIdea({ id: 7, revision: 3, notes: 'Canonical note' })] };
  await user.click(screen.getByRole('button', { name: 'Reload source' }));
  await waitFor(() => expect(session.editor.canDiscardRejectedEdit('idea', 7)).toBe(true));
  expect(session.records.idea(7)).toEqual({ revision: 1, input: { notes: 'Retained local note' } });
  expect(current.memberships).toEqual([membership]);
  expect(performCaptureRequest).toHaveBeenCalledTimes(1);
  event.unmount();
  idea();
  const discard = await screen.findByRole('button', { name: 'Discard unsaved Idea edits' });
  await waitFor(() => expect(discard).toBeEnabled());
  await user.click(discard);
  const notes = screen.getByRole('textbox', { name: 'Idea notes' });
  expect(notes).toHaveValue('Canonical note');
  await user.clear(notes);
  await user.type(notes, 'New explicit note');
  await user.tab();
  await waitFor(() => expect(session.records.idea(7)).toBeUndefined());
  expect(performCaptureRequest).toHaveBeenCalledTimes(2);
  const initial = vi.mocked(performCaptureRequest).mock.calls[0]?.[1];
  const retried = vi.mocked(performCaptureRequest).mock.calls[1]?.[1];
  expect(retried?.command).toEqual({
    kind: 'idea.update',
    id: 7,
    expectedRevision: 3,
    input: { notes: 'New explicit note' },
  });
  expect(retried?.operationId).not.toBe(initial?.operationId);
});
