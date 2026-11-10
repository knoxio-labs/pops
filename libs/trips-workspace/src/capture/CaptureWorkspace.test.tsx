import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadPlaces, loadVisits } from '../stay/api';
import { loadCaptureSource, performCaptureRequest } from './api';
import { CaptureWorkspace } from './CaptureWorkspace';
import { captureResult, captureSource } from './test-utils';

import type { CaptureWorkspaceProps } from './types';

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
  vi.mocked(loadCaptureSource).mockResolvedValue(captureSource());
  vi.mocked(loadPlaces).mockResolvedValue([]);
  vi.mocked(loadVisits).mockResolvedValue([]);
  vi.mocked(performCaptureRequest).mockImplementation(async (_, request) => captureResult(request));
});
afterEach(() => {
  cleanup();
  caches.forEach((cache) => cache.clear());
  caches.length = 0;
  vi.resetAllMocks();
});

function mount(
  view: CaptureWorkspaceProps['view'],
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  caches.push(cache);
  return {
    cache,
    ...render(
      <QueryClientProvider client={cache}>
        <CaptureWorkspace tripId={1} view={view} />
      </QueryClientProvider>
    ),
  };
}

it('retains verbatim composer material across Capture, Inbox and Explore remounts', async () => {
  const user = userEvent.setup();
  const first = mount('capture');
  await user.type(
    await screen.findByRole('textbox', { name: 'Capture text' }),
    '  Raw 東京 source'
  );
  first.unmount();
  const second = mount('inbox', first.cache);
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toHaveValue(
    '  Raw 東京 source'
  );
  second.unmount();
  mount('explore', first.cache);
  expect(await screen.findByRole('textbox', { name: 'Save possibility' })).toHaveValue(
    '  Raw 東京 source'
  );
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(performCaptureRequest).toHaveBeenCalledWith(
    expect.objectContaining({ tripId: 1 }),
    expect.objectContaining({
      command: expect.objectContaining({
        kind: 'capture.create',
        explore: true,
        input: expect.objectContaining({ originalText: '  Raw 東京 source' }),
      }),
    })
  );
});

it('saves a deliberately selected Idea subtype atomically without parsing source text', async () => {
  const user = userEvent.setup();
  mount('explore');
  await user.type(
    await screen.findByRole('textbox', { name: 'Save possibility' }),
    'Do not turn this into a title'
  );
  await user.click(screen.getByText('Optional details'));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'activity');
  await user.type(screen.getByRole('textbox', { name: 'Idea title' }), 'Explicit title');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(performCaptureRequest).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      command: expect.objectContaining({
        input: expect.objectContaining({
          originalText: 'Do not turn this into a title',
          classification: null,
        }),
        target: {
          mode: 'createIdea',
          input: { kind: 'activity', name: 'Explicit title', placeId: null, visitId: null },
        },
      }),
    })
  );
});

it('does not turn an initial source failure into an editable empty workspace', async () => {
  vi.mocked(loadCaptureSource).mockRejectedValue(new Error('Owner unavailable'));
  mount('inbox');
  expect(await screen.findByText('The request could not be completed')).toBeVisible();
  expect(screen.queryByRole('textbox', { name: 'Capture text' })).not.toBeInTheDocument();
});

it('keeps optional context failure independent of raw capture', async () => {
  vi.mocked(loadPlaces).mockRejectedValue(new Error('Places unavailable'));
  const user = userEvent.setup();
  mount('capture');
  await user.type(
    await screen.findByRole('textbox', { name: 'Capture text' }),
    'Unlocated raw note'
  );
  expect(await screen.findByRole('region', { name: 'places unavailable' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Capture' }));
  expect(performCaptureRequest).toHaveBeenCalledTimes(1);
});
