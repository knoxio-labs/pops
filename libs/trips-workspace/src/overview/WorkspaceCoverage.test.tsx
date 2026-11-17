import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { deferred } from '../capture/test-utils';
import { sourceStay, sourceVisits } from '../stay/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses, sourceEvent } from './test-utils';

afterEach(cleanup);

it('does not turn an undated Visit into a missing-night interval', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/visits', {
    visits: sourceVisits.map((visit) => ({ ...visit, timing: {} })),
  });
  responses.set('/trips/7/stays', { stays: [] });
  mountOverview(responses);
  const coverage = await screen.findByRole('region', { name: 'Where you sleep' });
  expect(await within(coverage).findAllByText('Dates undecided')).not.toHaveLength(0);
  expect(within(coverage).queryByText(/open nights|Needs a stay|Covered/)).not.toBeInTheDocument();
});

it('shows Reserved coverage without a Purchased assertion and preserves a separate proven gap', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/stays', {
    stays: [
      sourceStay({
        timing: { arrival: '2029-05-01', departure: '2029-05-04' },
        status: 'Reserved',
      }),
    ],
  });
  mountOverview(responses);
  const coverage = await screen.findByRole('region', { name: 'Where you sleep' });
  expect(within(coverage).getByText('May 2029')).toBeVisible();
  expect(
    within(coverage).getByRole('img', { name: /Wellington.*Covered.*Needs a stay/u })
  ).toBeInTheDocument();
  expect(await within(coverage).findByText('Needs a stay')).toBeVisible();
  expect(await within(coverage).findAllByText('5 open nights')).not.toHaveLength(0);
  expect(within(coverage).queryByText('Purchased')).not.toBeInTheDocument();
  const stay = await screen.findByRole('link', { name: 'Cedar guesthouse' });
  const stayRow = stay.closest('tr');
  if (!(stayRow instanceof HTMLTableRowElement)) throw new Error('Expected the stay route row');
  expect(within(stayRow).getByText('Reserved')).toBeVisible();
});

it('keeps the month axis in calendar order across a year boundary', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/visits', {
    visits: sourceVisits.map((visit) => ({
      ...visit,
      timing: { arrival: '2029-12-30', departure: '2030-01-02' },
    })),
  });
  responses.set('/trips/7/stays', {
    stays: [
      sourceStay({
        timing: { arrival: '2029-12-30', departure: '2030-01-01' },
        status: 'Reserved',
      }),
    ],
  });
  mountOverview(responses);
  const coverage = await screen.findByRole('region', { name: 'Where you sleep' });
  expect(within(coverage).getByText('Dec 2029')).toBeVisible();
  expect(within(coverage).getByText('Jan 2030')).toBeVisible();
});

it('does not count a booked and purchased event as overnight coverage', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/stays', { stays: [] });
  responses.set('/trips/7/events', {
    events: [
      sourceEvent({
        intention: 'In plan',
        arrangement: 'Booked',
        purchase: 'Purchased',
        timing: { start: '2029-05-03' },
      }),
    ],
  });
  mountOverview(responses);
  const coverage = await screen.findByRole('region', { name: 'Where you sleep' });
  expect(await within(coverage).findByText('Needs a stay')).toBeVisible();
  expect(await within(coverage).findAllByText('8 open nights')).not.toHaveLength(0);
});

it('retains uncertainty when the Stay collection is unavailable rather than claiming open nights', async () => {
  const responses = overviewResponses();
  responses.delete('/trips/7/stays');
  mountOverview(responses);
  const coverage = await screen.findByRole('region', { name: 'Where you sleep' });
  expect(within(coverage).getByText('Check coverage')).toBeVisible();
  expect(within(coverage).queryByText(/open nights|Needs a stay/)).not.toBeInTheDocument();
});

it.each(['stays', 'visits'] as const)(
  'withdraws cached empty-Stay gap claims during a pending and failed %s refresh',
  async (collection) => {
    const responses = overviewResponses();
    responses.set('/trips/7/stays', { stays: [] });
    const { cache, client } = mountOverview(responses);
    const coverage = await screen.findByRole('region', { name: 'Where you sleep' });
    expect(await within(coverage).findByText('Needs a stay')).toBeVisible();
    const originalFetch = client.getConfig().fetch;
    if (!originalFetch) throw new Error('Missing source transport');
    const refreshResponse = deferred<Response>();
    client.setConfig({
      fetch: (input, init) => {
        const path = new URL(new Request(input, init).url).pathname;
        return path === `/trips/7/${collection}`
          ? refreshResponse.promise
          : originalFetch(input, init);
      },
    });
    let refresh: Promise<void> | undefined;
    act(() => {
      refresh = cache.refetchQueries({
        queryKey: ['trips', 'http://overview.test', 7, collection],
        exact: true,
      });
    });
    await waitFor(() =>
      expect(within(coverage).queryByText(/open nights/)).not.toBeInTheDocument()
    );
    expect(within(coverage).getByText('Check coverage')).toBeVisible();
    await act(async () => {
      refreshResponse.resolve(
        Response.json(
          { code: 'source.unavailable', message: 'Read failed', retryable: true },
          { status: 503 }
        )
      );
      await refresh;
    });
    expect(cache.getQueryState(['trips', 'http://overview.test', 7, collection])).toMatchObject({
      status: 'error',
      fetchStatus: 'idle',
    });
    expect(within(coverage).queryByText(/open nights/)).not.toBeInTheDocument();
    expect(within(coverage).getByText('Check coverage')).toBeVisible();
    expect(cache.getQueryData(['trips', 'http://overview.test', 7, 'stays'])).toEqual([]);
  }
);

it('retains recorded stay facts while withholding an unverified gap during pending and failed refreshes', async () => {
  const responses = overviewResponses();
  responses.set('/trips/7/stays', {
    stays: [
      sourceStay({
        timing: { arrival: '2029-05-01', departure: '2029-05-04' },
        status: 'Reserved',
      }),
    ],
  });
  const { cache, client } = mountOverview(responses);
  const coverage = await screen.findByRole('region', { name: 'Where you sleep' });
  expect(await within(coverage).findByText('Needs a stay')).toBeVisible();
  expect(await within(coverage).findAllByText('5 open nights')).not.toHaveLength(0);
  const originalFetch = client.getConfig().fetch;
  if (!originalFetch) throw new Error('Missing source transport');
  const refreshResponse = deferred<Response>();
  client.setConfig({
    fetch: (input, init) => {
      const path = new URL(new Request(input, init).url).pathname;
      return path === '/trips/7/stays' ? refreshResponse.promise : originalFetch(input, init);
    },
  });
  const queryKey = ['trips', 'http://overview.test', 7, 'stays'];
  let refresh: Promise<void> | undefined;
  act(() => {
    refresh = cache.refetchQueries({ queryKey, exact: true });
  });
  expect(cache.getQueryState(queryKey)?.fetchStatus).toBe('fetching');
  expect(await within(coverage).findByText('Check coverage')).toBeVisible();
  expect(within(coverage).queryByText(/open nights/)).not.toBeInTheDocument();
  const stay = await screen.findByRole('link', { name: 'Cedar guesthouse' });
  const stayRow = stay.closest('tr');
  if (!(stayRow instanceof HTMLTableRowElement)) throw new Error('Expected the stay route row');
  expect(within(stayRow).getByText('Reserved')).toBeVisible();
  await act(async () => {
    refreshResponse.resolve(
      Response.json(
        { code: 'source.unavailable', message: 'Read failed', retryable: true },
        { status: 503 }
      )
    );
    await refresh;
  });
  expect(cache.getQueryState(queryKey)).toMatchObject({ status: 'error', fetchStatus: 'idle' });
  expect(cache.getQueryData(queryKey)).toEqual([
    expect.objectContaining({ id: 13, status: 'Reserved' }),
  ]);
  await waitFor(() => {
    expect(within(coverage).getByText('Check coverage')).toBeVisible();
    expect(within(coverage).queryByText(/open nights/)).not.toBeInTheDocument();
  });
});
