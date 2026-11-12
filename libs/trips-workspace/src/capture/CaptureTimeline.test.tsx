import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadPlaces, loadVisits } from '../stay/api';
import { createClient } from '../trips-api/client';
import { loadCaptureSource, performCaptureRequest } from './api';
import { CaptureMembershipContext } from './CaptureMembershipContext';
import { CaptureTimelineFilters } from './CaptureTimelineFilters';
import { CaptureWorkspace } from './CaptureWorkspace';
import { captureResult, captureSource, sourceCapture, sourceIdea } from './test-utils';

import type { ReactNode } from 'react';

import type { CaptureTimelineFiltersProps } from './CaptureTimelineFilters';
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
const member = (
  id: number,
  kind: 'capture' | 'idea' | 'event',
  revision = 9
): CaptureSource['memberships'][number] => ({
  id,
  tripId: 1,
  revision,
  source: { kind, id: 3 },
  removedAt: null,
  createdAt: '',
  updatedAt: '',
});
beforeEach(() => {
  vi.mocked(loadPlaces).mockResolvedValue([]);
  vi.mocked(loadVisits).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  caches.forEach((cache) => cache.clear());
  caches.length = 0;
  vi.resetAllMocks();
});
function mount(
  content: ReactNode,
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  caches.push(cache);
  return { cache, ...render(<QueryClientProvider client={cache}>{content}</QueryClientProvider>) };
}

it('removes the exact unavailable membership, retains uncertain retry across close/cache eviction and restores its own Undo', async () => {
  let current = { ...captureSource(), memberships: [member(41, 'event'), member(42, 'capture')] };
  vi.mocked(loadCaptureSource).mockImplementation(async () => current);
  vi.mocked(performCaptureRequest)
    .mockRejectedValueOnce(new Error('Lost response'))
    .mockImplementation(async (_, request) => {
      current = {
        ...current,
        memberships: current.memberships.map((row) =>
          row.id === 41
            ? {
                ...row,
                revision: row.revision + 1,
                removedAt: request.command.kind === 'undo' ? null : '2026-11-12T00:00:00Z',
              }
            : row
        ),
      };
      return captureResult(request, {
        ...captureSource(),
        memberships: current.memberships.filter((row) => row.id === 41),
      });
    });
  const content = <CaptureMembershipContext tripId={1} source={{ kind: 'event', id: 3 }} />;
  const first = mount(content);
  await userEvent.click(await screen.findByRole('button', { name: 'Remove from Explore' }));
  await screen.findByRole('button', { name: 'Retry Remove from Explore' });
  const request = vi.mocked(performCaptureRequest).mock.calls[0]?.[1];
  expect(request?.command).toEqual({ kind: 'explore.remove', id: 41, expectedRevision: 9 });
  first.unmount();
  first.cache.clear();
  vi.mocked(loadCaptureSource).mockRejectedValue(new Error('Read unavailable'));
  mount(content, first.cache);
  await userEvent.click(await screen.findByRole('button', { name: 'Retry Remove from Explore' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  expect(vi.mocked(performCaptureRequest).mock.calls[1]?.[1]).toEqual(request);
  expect(current.memberships.find((row) => row.id === 42)?.removedAt).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(performCaptureRequest).toHaveBeenCalledTimes(3));
  expect(vi.mocked(performCaptureRequest).mock.calls[2]?.[1]).toMatchObject({
    scope: 'explore',
    command: { kind: 'undo', targetOperationId: request?.operationId },
  });
  expect(await screen.findByRole('button', { name: 'Remove from Explore' })).toBeEnabled();
});

it('includes exact membership removal once inside the existing selected Capture/Idea editor', async () => {
  vi.mocked(loadCaptureSource).mockResolvedValue({
    ...captureSource([sourceCapture({ id: 3 })]),
    ideas: [sourceIdea({ id: 3 })],
    memberships: [member(41, 'idea'), member(42, 'capture')],
  });
  mount(<CaptureWorkspace tripId={1} view="explore" selectedSource={{ kind: 'idea', id: 3 }} />);
  expect(await screen.findByRole('button', { name: 'Remove from Explore' })).toBeEnabled();
  expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
  vi.mocked(performCaptureRequest).mockRejectedValue(new Error('Read unavailable'));
  await userEvent.click(screen.getByRole('button', { name: 'Remove from Explore' }));
  expect(vi.mocked(performCaptureRequest).mock.calls[0]?.[1].command).toEqual({
    kind: 'explore.remove',
    id: 41,
    expectedRevision: 9,
  });
});

it('fences a new removal after mutable owner drift without sending the captured command to the foreign owner', async () => {
  const client = createClient({ baseUrl: 'https://a.invalid' });
  vi.mocked(loadCaptureSource).mockResolvedValue({
    ...captureSource(),
    memberships: [member(41, 'event')],
  });
  mount(<CaptureMembershipContext tripId={1} client={client} source={{ kind: 'event', id: 3 }} />);
  await screen.findByRole('button', { name: 'Remove from Explore' });
  client.setConfig({ baseUrl: 'https://b.invalid' });
  await userEvent.click(screen.getByRole('button', { name: 'Remove from Explore' }));
  expect(performCaptureRequest).not.toHaveBeenCalled();
  expect(
    await screen.findByText('Restore the original Trips owner before retrying this operation.')
  ).toBeVisible();
});

it('keeps unavailable member references and nonmember captures in controlled Timeline filters despite optional catalogue outages', async () => {
  vi.mocked(loadCaptureSource).mockResolvedValue({
    ...captureSource([sourceCapture()]),
    memberships: [member(41, 'idea')],
  });
  vi.mocked(loadPlaces).mockRejectedValue(new Error('Places unavailable'));
  const onVisibility = vi.fn<CaptureTimelineFiltersProps['onVisibility']>();
  const onChange = vi.fn<CaptureTimelineFiltersProps['onChange']>();
  const onOpenSource = vi.fn<CaptureTimelineFiltersProps['onOpenSource']>();
  mount(
    <CaptureTimelineFilters
      tripId={1}
      selection={{ kind: 'all', organisation: 'all', location: 'all' }}
      onChange={onChange}
      onVisibility={onVisibility}
      onOpenSource={onOpenSource}
      label={(key) => key}
      referenceLabel={(kind, id) => `${kind} ${id}`}
    />
  );
  await userEvent.click(await screen.findByRole('button', { name: 'idea 3' }));
  expect(onOpenSource).toHaveBeenCalledWith({ kind: 'idea', id: 3 });
  expect(await screen.findByRole('region', { name: 'places unavailable' })).toBeVisible();
  await waitFor(() =>
    expect(onVisibility).toHaveBeenLastCalledWith({
      known: [
        { kind: 'capture', id: 1 },
        { kind: 'idea', id: 3 },
      ],
      visible: [
        { kind: 'capture', id: 1 },
        { kind: 'idea', id: 3 },
      ],
    })
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'organisation' }),
    'unorganised'
  );
  expect(onChange).toHaveBeenCalledWith({
    kind: 'all',
    organisation: 'unorganised',
    location: 'all',
  });
  expect(performCaptureRequest).not.toHaveBeenCalled();
});
