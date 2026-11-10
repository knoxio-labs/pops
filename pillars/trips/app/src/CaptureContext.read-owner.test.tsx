import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { captureReadOwner } from './capture-read-fixture';

let owner: ReturnType<typeof captureReadOwner>;
const key = ['trips', 'http://owner-a.test', 1, 'capture_workspace'] as const;
beforeEach(() => {
  owner = captureReadOwner();
});
afterEach(() => {
  cleanup();
  owner.close();
});

it('retains last good A when a stale-key refetch sees mutable B and restored A is unavailable', async () => {
  const mounted = owner.mount();
  expect(await screen.findByRole('textbox', { name: 'Capture title' })).toHaveValue('owner-a.test');
  owner.client.setConfig({ baseUrl: 'http://owner-b.test' });
  await act(() => owner.cache.refetchQueries({ queryKey: key }));
  owner.client.setConfig({ baseUrl: 'http://owner-a.test' });
  owner.state.failA = true;
  mounted.rerender(owner.view());
  await act(() => owner.cache.refetchQueries({ queryKey: key }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Capture title' })).toHaveValue('owner-a.test')
  );
  expect(owner.state.reads.some((url) => new URL(url).hostname === 'owner-b.test')).toBe(false);
});

it('rejects deferred read delivery after origin drift without losing an unknown command or its exact retry', async () => {
  const user = userEvent.setup();
  owner.state.failWrites = true;
  const mounted = owner.mount({ selectedSource: null });
  await user.type(
    await screen.findByRole('textbox', { name: 'Capture text' }),
    ' Unknown raw source '
  );
  await user.click(screen.getByRole('button', { name: 'Capture' }));
  expect(await screen.findByRole('button', { name: 'Retry Capture' })).toBeVisible();
  mounted.rerender(owner.view());
  expect(await screen.findByRole('textbox', { name: 'Capture title' })).toHaveValue('owner-a.test');
  const held = owner.holdRead();
  const count = owner.state.reads.length;
  const pending = owner.cache.refetchQueries({ queryKey: key });
  await waitFor(() => expect(owner.state.reads).toHaveLength(count + 1));
  owner.client.setConfig({ baseUrl: 'http://owner-b.test' });
  held.release();
  await act(() => pending);
  expect(screen.getByRole('textbox', { name: 'Capture title' })).toHaveValue('owner-a.test');
  expect(screen.getByRole('button', { name: 'Retry Capture' })).toBeVisible();
  owner.client.setConfig({ baseUrl: 'http://owner-a.test' });
  owner.state.failWrites = false;
  await user.click(screen.getByRole('button', { name: 'Retry Capture' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Retry Capture' })).not.toBeInTheDocument()
  );
  expect(owner.state.writes).toHaveLength(2);
  expect(owner.state.writes[1]).toEqual(owner.state.writes[0]);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

it('keeps an in-flight A write acknowledgement and invalidates only its captured owner scope', async () => {
  const user = userEvent.setup();
  const invalidations = vi.spyOn(owner.cache, 'invalidateQueries');
  owner.mount({ selectedSource: null });
  const held = owner.holdWrite();
  await user.type(
    await screen.findByRole('textbox', { name: 'Capture text' }),
    ' Accepted A command '
  );
  await user.click(screen.getByRole('button', { name: 'Capture' }));
  await waitFor(() => expect(owner.state.writes).toHaveLength(1));
  owner.client.setConfig({ baseUrl: 'http://owner-b.test' });
  held.release();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  expect(screen.getByRole('textbox', { name: 'Capture text' })).toHaveValue('');
  await waitFor(() => expect(invalidations).toHaveBeenCalledWith({ queryKey: key.slice(0, 3) }));
  expect(invalidations).not.toHaveBeenCalledWith({ queryKey: ['trips', 'http://owner-b.test', 1] });
  expect(owner.state.writes).toHaveLength(1);
});

it('separates explicit owner views and restores last good A when its fresh read fails', async () => {
  const mounted = owner.mount();
  expect(await screen.findByRole('textbox', { name: 'Capture title' })).toHaveValue('owner-a.test');
  owner.client.setConfig({ baseUrl: 'http://owner-b.test' });
  mounted.rerender(owner.view());
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Capture title' })).toHaveValue('owner-b.test')
  );
  owner.state.failA = true;
  owner.client.setConfig({ baseUrl: 'http://owner-a.test' });
  mounted.rerender(owner.view());
  await act(() => owner.cache.refetchQueries({ queryKey: key }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Capture title' })).toHaveValue('owner-a.test')
  );
});

it('rejects foreign cached proof before it can replace the retained owner row', async () => {
  owner.mount();
  expect(await screen.findByRole('textbox', { name: 'Capture title' })).toHaveValue('owner-a.test');
  act(() =>
    owner.cache.setQueryData(key, {
      source: owner.source('Foreign cached owner B'),
      generation: 0,
      owner: { origin: 'http://owner-b.test', tripId: 1 },
    })
  );
  expect(
    await screen.findByText('The cached source belongs to another Trips owner.')
  ).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Capture title' })).toHaveValue('owner-a.test');
});
