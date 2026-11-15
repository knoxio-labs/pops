import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadPlaces, loadVisits } from '../stay/api';
import { loadCaptureSource, performCaptureRequest } from './api';
import { CaptureWorkspace } from './CaptureWorkspace';
import { captureResult, captureSource, sourceCapture, sourceIdea, sourceEvent } from './test-utils';

import type { CaptureSource, CaptureWorkspaceProps } from './types';

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
  view: CaptureWorkspaceProps['view'],
  source: CaptureSource,
  onViewEvent?: (id: number) => void
): void {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  vi.mocked(loadCaptureSource).mockResolvedValue(source);
  render(
    <QueryClientProvider client={cache}>
      <CaptureWorkspace tripId={1} view={view} onViewEvent={onViewEvent} />
    </QueryClientProvider>
  );
}

it('retains failed explicit target input across filters and never copies raw text into a created Journey', async () => {
  const source = captureSource([
    sourceCapture({ classification: 'event', originalText: 'Raw source stays raw' }),
  ]);
  vi.mocked(performCaptureRequest).mockRejectedValue(new Error('Unknown outcome'));
  const user = userEvent.setup();
  mount('inbox', source);
  const row = await screen.findByRole('article', { name: 'Capture 1' });
  expect(within(row).getByText('unorganised')).toBeVisible();
  await user.click(within(row).getByText('Organise', { exact: true }));
  await user.selectOptions(
    within(row).getByRole('combobox', { name: 'Organise as' }),
    'createJourney'
  );
  await user.type(within(row).getByRole('textbox', { name: 'Target name' }), 'Independent Journey');
  await user.click(within(row).getByRole('button', { name: 'Organise capture' }));
  expect(performCaptureRequest).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      command: {
        kind: 'capture.organise',
        id: 1,
        expectedRevision: 1,
        target: { mode: 'createJourney', input: { name: 'Independent Journey' } },
      },
    })
  );
  await user.selectOptions(screen.getByRole('combobox', { name: 'Inbox filter' }), 'organised');
  expect(screen.queryByRole('article', { name: 'Capture 1' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Inbox filter' }), 'all');
  const restored = screen.getByRole('article', { name: 'Capture 1' });
  await user.click(within(restored).getByText('Organise', { exact: true }));
  expect(within(restored).getByRole('textbox', { name: 'Target name' })).toHaveValue(
    'Independent Journey'
  );
  expect(within(restored).getByText('Raw source stays raw')).toBeVisible();
});

it.each(['missing visit', 'failed places', 'missing Event'] as const)(
  'keeps source navigation independent of optional context: %s',
  async (state) => {
    if (state === 'failed places') {
      vi.mocked(loadPlaces).mockRejectedValue(new Error('Place catalogue unavailable'));
      vi.mocked(loadVisits).mockResolvedValue([
        {
          id: 3,
          tripId: 1,
          placeId: 2,
          revision: 0,
          notes: '',
          sourceLinks: [],
          timing: {},
          createdAt: '',
          updatedAt: '',
        },
      ]);
    }
    const event = sourceEvent();
    const onViewEvent = vi.fn();
    mount(
      'explore',
      {
        ...captureSource(),
        events: state === 'missing Event' ? [] : [event],
        memberships: [
          {
            id: 8,
            tripId: 1,
            source: { kind: 'event', id: event.id },
            revision: 1,
            removedAt: null,
            createdAt: '',
            updatedAt: '',
          },
        ],
      },
      onViewEvent
    );
    const row = await screen.findByRole('article', { name: 'event 7' });
    if (state === 'missing Event') {
      expect(within(row).queryByRole('button', { name: 'Open Event 7' })).not.toBeInTheDocument();
      expect(within(row).getByText('The recorded source is unavailable.')).toBeVisible();
    } else {
      if (state === 'failed places')
        await screen.findByRole('region', { name: 'places unavailable' });
      await userEvent.click(
        within(screen.getByRole('article', { name: 'event 7' })).getByRole('button', {
          name: 'Open Event 7',
        })
      );
      expect(onViewEvent).toHaveBeenCalledExactlyOnceWith(7);
      expect(
        within(row).queryByText('The recorded source is unavailable.')
      ).not.toBeInTheDocument();
    }
  }
);

it('edits the actual Idea source and removes only its Explore membership', async () => {
  const idea = sourceIdea({
    id: 7,
    name: 'Recorded Idea',
    placeId: 88,
    timing: { mode: 'dates', from: '2026-11-20', to: '2026-11-10' },
  });
  const source: CaptureSource = {
    ...captureSource(),
    ideas: [idea],
    memberships: [
      {
        id: 4,
        tripId: 1,
        source: { kind: 'idea', id: 7 },
        revision: 3,
        removedAt: null,
        createdAt: idea.createdAt,
        updatedAt: idea.updatedAt,
      },
    ],
  };
  const edited = { ...source, ideas: [{ ...idea, notes: 'Explicit note', revision: 2 }] };
  vi.mocked(performCaptureRequest).mockImplementation(async (_, request) => {
    if (request.command.kind === 'idea.update') return captureResult(request, edited);
    if (request.command.kind === 'explore.remove')
      return captureResult(request, { ...edited, memberships: [] });
    throw new Error('Unexpected capture command');
  });
  const user = userEvent.setup();
  mount('explore', source);
  const row = await screen.findByRole('article', { name: 'idea 7' });
  expect(screen.getByRole('region', { name: 'Unavailable place 88' })).toBeVisible();
  await user.click(within(row).getByText('Edit Idea 7'));
  expect(within(row).getByText(/The end date is before/)).toBeVisible();
  await user.type(within(row).getByRole('textbox', { name: 'Idea notes' }), 'Explicit note');
  await user.tab();
  expect(performCaptureRequest).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      command: {
        kind: 'idea.update',
        id: 7,
        expectedRevision: 1,
        input: { notes: 'Explicit note' },
      },
    })
  );
  const remove = within(row).getByRole('button', { name: 'Remove from Explore' });
  await waitFor(() => expect(remove).toBeEnabled());
  await user.click(remove);
  await waitFor(() =>
    expect(performCaptureRequest).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ command: { kind: 'explore.remove', id: 4, expectedRevision: 3 } })
    )
  );
});
