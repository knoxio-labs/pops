import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { captureReadOwner } from './capture-read-fixture';

let owner: ReturnType<typeof captureReadOwner>;
const key = ['trips', 'http://owner-a.test', 1, 'capture_workspace'] as const;
const selectedSource = { kind: 'idea', id: 19 } as const;
beforeEach(() => {
  owner = captureReadOwner();
});
afterEach(() => {
  cleanup();
  owner.close();
});
function options(label: string) {
  return within(screen.getByRole('combobox', { name: label }))
    .getAllByRole('option')
    .map((row) => row.textContent);
}
async function ready() {
  expect(await screen.findByRole('textbox', { name: 'Idea name' })).toHaveValue(
    'owner-a.test Idea'
  );
  await screen.findByRole('option', { name: 'owner-a.test · 9' });
  await screen.findByRole('option', { name: 'Visit 11' });
  await waitFor(() => expect(owner.cache.isFetching()).toBe(0));
}

it('keeps settled owner A options when its source refetch encounters mutable owner B', async () => {
  owner.mount({ selectedSource });
  await ready();
  owner.client.setConfig({ baseUrl: 'http://owner-b.test' });
  await act(() => owner.cache.refetchQueries({ queryKey: key }));
  await act(() =>
    owner.cache.refetchQueries({ queryKey: ['trips', 'http://owner-b.test', 'places'] })
  );
  await waitFor(() => expect(owner.cache.isFetching()).toBe(0));
  expect(screen.getByRole('textbox', { name: 'Idea name' })).toHaveValue('owner-a.test Idea');
  expect(options('Idea recorded location')).toEqual(['Unassigned', 'owner-a.test · 9']);
  expect(options('Idea in visit')).toEqual(['No visit', 'Visit 11']);
  expect(owner.state.contextReads.some((url) => new URL(url).hostname === 'owner-b.test')).toBe(
    false
  );
});

it.each(['places', 'visits'] as const)(
  'rejects deferred %s delivery and preserves last good A when restored context fails',
  async (kind) => {
    const mounted = owner.mount({ selectedSource });
    await ready();
    const held = owner.holdCatalogue(kind);
    const count = owner.state.contextReads.filter((url) => url.endsWith(`/${kind}`)).length;
    const pending = owner.cache.refetchQueries({ queryKey: ['trips', 'http://owner-a.test'] });
    await waitFor(() =>
      expect(owner.state.contextReads.filter((url) => url.endsWith(`/${kind}`))).toHaveLength(
        count + 1
      )
    );
    owner.client.setConfig({ baseUrl: 'http://owner-b.test' });
    held.release();
    await act(() => pending);
    await waitFor(() => expect(owner.cache.isFetching()).toBe(0));
    expect(screen.getByRole('region', { name: `${kind} unavailable` })).toBeVisible();
    expect(options('Idea recorded location')).toEqual(['Unassigned', 'owner-a.test · 9']);
    expect(options('Idea in visit')).toEqual(['No visit', 'Visit 11']);
    owner.state.failContextA = true;
    owner.client.setConfig({ baseUrl: 'http://owner-a.test' });
    mounted.rerender(owner.view({ selectedSource }));
    await act(() => owner.cache.refetchQueries({ queryKey: ['trips', 'http://owner-a.test'] }));
    await waitFor(() => expect(owner.cache.isFetching()).toBe(0));
    expect(options('Idea recorded location')).toEqual(['Unassigned', 'owner-a.test · 9']);
    expect(options('Idea in visit')).toEqual(['No visit', 'Visit 11']);
  }
);

it('keeps failed optional catalogues independent of a confirmed raw capture', async () => {
  owner.state.failContextA = true;
  owner.mount({ selectedSource: null });
  const user = userEvent.setup();
  await user.type(
    await screen.findByRole('textbox', { name: 'Capture text' }),
    'Raw without context'
  );
  await screen.findByRole('region', { name: 'places unavailable' });
  await screen.findByRole('region', { name: 'visits unavailable' });
  await user.click(screen.getByRole('button', { name: 'Capture' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled());
  expect(screen.getByRole('textbox', { name: 'Capture text' })).toHaveValue('');
  expect(owner.state.writes).toHaveLength(1);
});

it('separates explicit B options from restored A when A catalogues are unavailable', async () => {
  const mounted = owner.mount({ selectedSource });
  await ready();
  owner.client.setConfig({ baseUrl: 'http://owner-b.test' });
  mounted.rerender(owner.view({ selectedSource }));
  await screen.findByRole('option', { name: 'owner-b.test · 9' });
  await screen.findByRole('option', { name: 'Visit 29' });
  await waitFor(() => expect(owner.cache.isFetching()).toBe(0));
  owner.state.failContextA = true;
  owner.client.setConfig({ baseUrl: 'http://owner-a.test' });
  mounted.rerender(owner.view({ selectedSource }));
  await act(() => owner.cache.refetchQueries({ queryKey: ['trips', 'http://owner-a.test'] }));
  await waitFor(() => expect(owner.cache.isFetching()).toBe(0));
  expect(options('Idea recorded location')).toEqual(['Unassigned', 'owner-a.test · 9']);
  expect(options('Idea in visit')).toEqual(['No visit', 'Visit 11']);
});
