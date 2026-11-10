import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { journeyKey } from './api';
import { JourneyWorkspace } from './JourneyWorkspace';
import { journeyTransport, sourceJourney, sourceLeg, sourceProblem } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});
const group = {
  id: 80,
  tripId: 7,
  currentJourneyId: 20,
  alternativeJourneyIds: [21],
  revision: 3,
  createdAt: '2029-01-01T00:00:00Z',
  updatedAt: '2029-01-01T00:00:00Z',
};
const source = (id: number, name: string) => ({
  legRevision: 0,
  journey: sourceJourney({ id, name }),
  legs: [sourceLeg({ id: id + 100, journeyId: id })],
});

function mount(transport: ReturnType<typeof journeyTransport>, initial = 20, controlled = true) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  caches.push(cache);
  const navigations: number[] = [];
  function Host() {
    const [viewed, setViewed] = useState(initial);
    const [mounted, setMounted] = useState(true);
    return (
      <QueryClientProvider client={cache}>
        <button onClick={() => setViewed(30)}>View another source</button>
        <button onClick={() => setMounted(false)}>Leave workspace</button>
        {mounted ? (
          <JourneyWorkspace
            tripId={7}
            journeyId={viewed}
            client={transport.client}
            onViewJourney={
              controlled
                ? (id) => {
                    navigations.push(id);
                    setViewed(id);
                  }
                : undefined
            }
          />
        ) : (
          <p>Workspace left</p>
        )}
      </QueryClientProvider>
    );
  }
  render(<Host />);
  return { cache, navigations };
}
function deferred() {
  let resolve: () => void = () => {
    throw new Error('Deferred not initialized');
  };
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
const writes = (transport: ReturnType<typeof journeyTransport>) =>
  transport.requests.filter((request) => request.method !== 'GET');

describe('Literal journey source navigation', () => {
  it('honours a changed source identity even when the component host supplies no navigation callback', async () => {
    const transport = journeyTransport({ alternatives: [source(30, 'Manually viewed')] });
    mount(transport, 20, false);
    expect(
      await screen.findByRole('heading', { name: 'Harbour connection', level: 1 })
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'View another source' }));
    expect(await screen.findByRole('heading', { name: 'Manually viewed', level: 1 })).toBeVisible();
  });
  it('expands an editor only within the explicit membership when two groups share the same source', async () => {
    const transport = journeyTransport({
      groups: [group, { ...group, id: 81 }],
      alternatives: [source(21, 'Shared independent source')],
    });
    mount(transport);
    const first = await screen.findByRole('region', { name: 'Alternative group 80' });
    const second = screen.getByRole('region', { name: 'Alternative group 81' });
    fireEvent.click(within(first).getByRole('button', { name: 'Edit option' }));
    expect(await within(first).findByLabelText('Transport mode')).toBeVisible();
    expect(within(second).queryByLabelText('Transport mode')).toBeNull();
    expect(writes(transport)).toEqual([]);
  });
  it('does not restore an old viewed URL when manual navigation overtakes a pending selection Undo', async () => {
    const gate = deferred();
    const selected = { ...group, currentJourneyId: 21, alternativeJourneyIds: [20], revision: 4 };
    const transport = journeyTransport({
      groups: [group],
      alternatives: [source(21, 'Selected source'), source(30, 'Manually viewed')],
      writes: [
        { status: 200, body: selected },
        { status: 200, body: { ...group, revision: 5 } },
      ],
    });
    const { navigations } = mount(transport);
    fireEvent.click(await screen.findByRole('button', { name: 'Use journey' }));
    expect(await screen.findByRole('heading', { name: 'Selected source', level: 1 })).toBeVisible();
    transport.waitWrites(gate.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Undo selection' }));
    await waitFor(() => expect(writes(transport)).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'View another source' }));
    expect(await screen.findByRole('heading', { name: 'Manually viewed', level: 1 })).toBeVisible();
    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add option' })).toBeEnabled());
    expect(screen.getByRole('heading', { name: 'Manually viewed', level: 1 })).toBeVisible();
    expect(navigations).toEqual([21]);
    expect(writes(transport)[1]?.body).toEqual({ journeyId: 20, expectedRevision: 4 });
  });
  it('undoes the prior selection but returns to the original viewed source even when these are different identities', async () => {
    const originalGroup = { ...group, alternativeJourneyIds: [21, 22] };
    const transport = journeyTransport({
      source: source(21, 'Originally viewed'),
      groups: [originalGroup],
      alternatives: [source(20, 'Previously selected'), source(22, 'New selection')],
      writes: [
        {
          status: 200,
          body: { ...group, currentJourneyId: 22, alternativeJourneyIds: [21, 20], revision: 4 },
        },
        { status: 200, body: { ...originalGroup, revision: 5 } },
      ],
    });
    const { navigations } = mount(transport, 21);
    expect(
      await screen.findByRole('heading', { name: 'Originally viewed', level: 1 })
    ).toBeVisible();
    const option = await screen.findByRole('article', { name: 'Journey option 22' });
    fireEvent.click(within(option).getByRole('button', { name: 'Use journey' }));
    expect(await screen.findByRole('heading', { name: 'New selection', level: 1 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Undo selection' }));
    expect(
      await screen.findByRole('heading', { name: 'Originally viewed', level: 1 })
    ).toBeVisible();
    expect(navigations).toEqual([22, 21]);
    expect(writes(transport).map((request) => request.body)).toEqual([
      { journeyId: 22, expectedRevision: 3 },
      { journeyId: 20, expectedRevision: 4 },
    ]);
  });
  it('never adopts an unrelated refetched revision to make its own inverse writable', async () => {
    const selected = { ...group, currentJourneyId: 21, alternativeJourneyIds: [20], revision: 4 };
    const transport = journeyTransport({
      groups: [group],
      alternatives: [source(21, 'Selected source')],
      writes: [{ status: 200, body: selected }],
    });
    const { cache } = mount(transport);
    fireEvent.click(await screen.findByRole('button', { name: 'Use journey' }));
    expect(await screen.findByRole('heading', { name: 'Selected source', level: 1 })).toBeVisible();
    await act(async () => {
      cache.setQueryData(
        ['trips', 'http://journeys.test', 7, 'journey-groups'],
        [{ ...selected, revision: 9 }]
      );
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo selection' })).toBeDisabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo selection' }));
    expect(writes(transport)).toHaveLength(1);
  });
  it('selects the explicitly chosen membership when a source belongs to multiple groups', async () => {
    const second = { ...group, id: 81, alternativeJourneyIds: [30], revision: 9 };
    const transport = journeyTransport({
      groups: [group, second],
      alternatives: [source(21, 'First group option'), source(30, 'Second group option')],
      writes: [
        {
          status: 200,
          body: { ...second, currentJourneyId: 30, alternativeJourneyIds: [20], revision: 10 },
        },
      ],
    });
    mount(transport);
    const membership = await screen.findByRole('region', { name: 'Alternative group 81' });
    fireEvent.click(within(membership).getByRole('button', { name: 'Use journey' }));
    expect(
      await screen.findByRole('heading', { name: 'Second group option', level: 1 })
    ).toBeVisible();
    expect(writes(transport)).toEqual([
      {
        method: 'PUT',
        path: '/trips/7/journey-groups/81/selection',
        body: { journeyId: 30, expectedRevision: 9 },
      },
    ]);
  });
  it.each([200, 409])(
    'ignores a late selection response after manual source navigation (HTTP %i)',
    async (status) => {
      const gate = deferred();
      const transport = journeyTransport({
        groups: [group],
        alternatives: [source(21, 'Late selection'), source(30, 'Manually viewed')],
        writeWait: gate.promise,
        writes: [
          {
            status,
            body:
              status === 200
                ? { ...group, currentJourneyId: 21, alternativeJourneyIds: [20], revision: 4 }
                : sourceProblem('trips.group.stale'),
          },
        ],
      });
      const { navigations } = mount(transport);
      fireEvent.click(await screen.findByRole('button', { name: 'Use journey' }));
      await waitFor(() => expect(writes(transport)).toHaveLength(1));
      fireEvent.click(screen.getByRole('button', { name: 'View another source' }));
      expect(
        await screen.findByRole('heading', { name: 'Manually viewed', level: 1 })
      ).toBeVisible();
      await act(async () => {
        gate.resolve();
      });
      if (status === 200) {
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Add option' })).toBeEnabled()
        );
      } else {
        expect(await screen.findByRole('button', { name: 'Reload alternatives' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Add option' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
        expect(writes(transport)).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Reload alternatives' }));
        await waitFor(() =>
          expect(screen.getByRole('button', { name: 'Add option' })).toBeEnabled()
        );
      }
      expect(screen.getByRole('heading', { name: 'Manually viewed', level: 1 })).toBeVisible();
      expect(navigations).toEqual([]);
      expect(screen.queryByRole('button', { name: 'Undo selection' })).toBeNull();
      expect(screen.queryByText('trips.group.stale')).toBeNull();
    }
  );
  it('does not navigate after a pending selection leaves the workspace instance', async () => {
    const gate = deferred();
    const transport = journeyTransport({
      groups: [group],
      alternatives: [source(21, 'Late selection')],
      writeWait: gate.promise,
      writes: [
        {
          status: 200,
          body: { ...group, currentJourneyId: 21, alternativeJourneyIds: [20], revision: 4 },
        },
      ],
    });
    const { cache, navigations } = mount(transport);
    fireEvent.click(await screen.findByRole('button', { name: 'Use journey' }));
    await waitFor(() => expect(writes(transport)).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Leave workspace' }));
    await act(async () => {
      gate.resolve();
    });
    await waitFor(() =>
      expect(
        cache.getQueryData(['trips', 'http://journeys.test', 7, 'journey-groups'])
      ).toMatchObject([{ currentJourneyId: 21 }])
    );
    expect(screen.getByText('Workspace left')).toBeVisible();
    expect(navigations).toEqual([]);
  });
  it('does not replace a manually viewed source with an older source read', async () => {
    const gate = deferred();
    const transport = journeyTransport({
      alternatives: [source(30, 'Manually viewed')],
      readWait: { path: '/trips/7/journeys/20', promise: gate.promise },
    });
    const { cache } = mount(transport);
    await waitFor(() =>
      expect(transport.requests.some((request) => request.path === '/trips/7/journeys/20')).toBe(
        true
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'View another source' }));
    expect(await screen.findByRole('heading', { name: 'Manually viewed', level: 1 })).toBeVisible();
    await act(async () => {
      gate.resolve();
    });
    await waitFor(() =>
      expect(
        cache.getQueryData(journeyKey({ tripId: 7, journeyId: 20, client: transport.client }))
      ).toMatchObject({ journey: { id: 20 } })
    );
    expect(screen.getByRole('heading', { name: 'Manually viewed', level: 1 })).toBeVisible();
  });
});
