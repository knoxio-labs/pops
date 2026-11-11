import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';

import { captureQueryKey } from '../capture/api';
import { findCaptureSession } from '../capture/browser-session';
import { deferred, sourceCapture } from '../capture/test-utils';
import { captureReceipt, mountCaptureTimeline } from './capture-cache.test-utils';

const mounted: ReturnType<typeof mountCaptureTimeline>[] = [];
afterEach(() => {
  cleanup();
  mounted.splice(0).forEach(({ cache }) => cache.clear());
});
function mount(initial: Parameters<typeof mountCaptureTimeline>[0] = 'both') {
  const fixture = mountCaptureTimeline(initial);
  mounted.push(fixture);
  return fixture;
}
async function ready(fixture: ReturnType<typeof mountCaptureTimeline>) {
  await screen.findByRole('textbox', { name: 'Capture text' });
  await screen.findByRole('button', { name: 'Timeline idea' });
  await waitFor(() => expect(fixture.cache.isFetching()).toBe(0));
  expect(screen.getByRole('button', { name: 'Timeline capture' })).toBeVisible();
}
function compose(text: string) {
  const tool = within(screen.getByRole('region', { name: 'Capture tools' }));
  fireEvent.change(tool.getByRole('textbox', { name: 'Capture text' }), {
    target: { value: text },
  });
  fireEvent.click(tool.getByRole('button', { name: 'Capture' }));
}

it.each(['overview', 'capture'] as const)(
  'keeps raw Timeline and proved Capture reads independent when %s opens first',
  async (initial) => {
    const fixture = mount(initial);
    if (initial === 'overview') await screen.findByRole('button', { name: 'Timeline idea' });
    else await screen.findByRole('textbox', { name: 'Capture text' });
    fixture.show('both');
    await ready(fixture);
    const key = captureQueryKey({ tripId: 7, client: fixture.client });
    expect(fixture.cache.getQueryData(key)).toMatchObject({
      source: fixture.source,
      generation: 0,
    });
    expect(fixture.cache.getQueryData([...key, 'overview'])).toEqual(fixture.source);
    const reads = fixture.reads.length;
    await fixture.cache.invalidateQueries({ queryKey: key.slice(0, 3) });
    await ready(fixture);
    expect(fixture.reads.length).toBeGreaterThan(reads + 1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Capture text' }), {
      target: { value: 'Retained draft' },
    });
    fixture.show('overview');
    fixture.show('both');
    await ready(fixture);
    expect(screen.getByRole('textbox', { name: 'Capture text' })).toHaveValue('Retained draft');
    expect(fixture.writes).toEqual([]);
  }
);

it('retains an unknown exact command through closure and refreshes both consumers after retry', async () => {
  const fixture = mount();
  await ready(fixture);
  const next = {
    ...fixture.source,
    captures: [
      ...fixture.source.captures,
      sourceCapture({ id: 2, tripId: 7, originalText: 'Recovered source' }),
    ],
  };
  fixture.setWrite(async (operationId) => {
    if (fixture.writes.length === 1)
      return Response.json(
        { code: 'trips.source.unavailable', message: 'Lost response', retryable: true },
        { status: 503 }
      );
    fixture.setSource(next);
    return Response.json(captureReceipt(operationId, next));
  });
  compose('Recovered source');
  await screen.findByRole('button', { name: 'Retry Capture' });
  fixture.show('overview');
  const key = captureQueryKey({ tripId: 7, client: fixture.client });
  await fixture.cache.invalidateQueries({ queryKey: key.slice(0, 3) });
  fixture.show('both');
  fireEvent.click(await screen.findByRole('button', { name: 'Retry Capture' }));
  await screen.findByRole('button', { name: 'Recovered source' });
  await ready(fixture);
  expect(fixture.writes).toHaveLength(2);
  expect(fixture.writes[1]).toEqual(fixture.writes[0]);
  expect(fixture.cache.getQueryData([...key, 'overview'])).toEqual(next);
  expect(fixture.cache.getQueryData(key)).toMatchObject({ source: next, generation: 1 });
});

it('retains a late own acknowledgement and refreshes Timeline on contextual reopen', async () => {
  const fixture = mount();
  await ready(fixture);
  const session = findCaptureSession(fixture.cache, { tripId: 7, client: fixture.client });
  if (!session) throw new Error('Public Capture view did not retain its session');
  const response = deferred<Response>();
  fixture.setWrite(() => response.promise);
  const next = {
    ...fixture.source,
    captures: [
      ...fixture.source.captures,
      sourceCapture({ id: 2, tripId: 7, originalText: 'Late source' }),
    ],
  };
  compose('Late source');
  await waitFor(() => expect(fixture.writes).toHaveLength(1));
  fixture.show('overview');
  fixture.setSource(next);
  const body = fixture.writes[0];
  expect(body).toHaveProperty('operationId');
  fixture.setWrite(async (operationId) => Response.json(captureReceipt(operationId, next)));
  response.resolve(
    Response.json(captureReceipt(z.object({ operationId: z.uuid() }).parse(body).operationId, next))
  );
  await waitFor(() =>
    expect(session.editor.getState()).toMatchObject({
      busy: false,
      generation: 1,
      undoCount: 1,
      source: next,
    })
  );
  expect(screen.queryByRole('textbox', { name: 'Capture text' })).not.toBeInTheDocument();
  fixture.show('both');
  await screen.findByRole('button', { name: 'Late source' });
  await ready(fixture);
  expect(screen.getByRole('textbox', { name: 'Capture text' })).toHaveValue('');
  expect(
    within(screen.getByRole('region', { name: 'Capture tools' })).getByRole('button', {
      name: 'Undo',
    })
  ).toBeEnabled();
  expect(fixture.writes).toHaveLength(1);
});
