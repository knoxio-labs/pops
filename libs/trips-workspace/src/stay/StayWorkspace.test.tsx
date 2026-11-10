import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { stayQueryKey } from './api';
import { staySource } from './model';
import { StayWorkspace } from './StayWorkspace';
import { testNightLabel, problem, sourceStay, workspaceTransport } from './test-utils';

const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
});

function mount(
  transport: ReturnType<typeof workspaceTransport>,
  identity = { tripId: 7, stayId: 13 },
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } })
) {
  caches.push(cache);
  return render(
    <QueryClientProvider client={cache}>
      <StayWorkspace formatNights={testNightLabel} {...identity} client={transport.client} />
    </QueryClientProvider>
  );
}
async function edit(label: string, value: string) {
  const field = await screen.findByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}
async function saved() {
  await waitFor(() => expect(screen.getByText('Changes saved')).toBeVisible());
}

describe('Source-backed In visit stay workspace', () => {
  it('retains the cached editor and unsaved draft through background read failure and retry', async () => {
    const initial = sourceStay();
    const transport = workspaceTransport({
      gets: [
        { status: 200, body: initial },
        { status: 503, body: problem('trips.temporarily_unavailable') },
      ],
    });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(transport, undefined, cache);
    const field = await screen.findByLabelText('Stay name');
    fireEvent.change(field, { target: { value: 'Uncommitted stay' } });
    const queryKey = stayQueryKey({ tripId: 7, stayId: 13, client: transport.client });
    await act(async () => {
      await cache.refetchQueries({ queryKey });
    });
    expect(await screen.findByText('trips.temporarily_unavailable')).toBeVisible();
    expect(screen.getByLabelText('Stay name')).toHaveValue('Uncommitted stay');
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText('trips.temporarily_unavailable')).toBeNull());
    expect(screen.getByLabelText('Stay name')).toHaveValue('Uncommitted stay');
    expect(transport.patches).toEqual([]);
  });
  it('renders real sources and same-visit neighbours without defaulting soft status or copying visit dates', async () => {
    const transport = workspaceTransport({
      neighbours: [
        sourceStay({ id: 14, name: 'Neighbour source' }),
        sourceStay({ id: 15, visitId: 99, name: 'Foreign source' }),
      ],
    });
    mount(transport);
    expect(await screen.findByLabelText('Stay name')).toHaveValue('Cedar guesthouse');
    expect(screen.getByLabelText('Check-in date')).toHaveValue('2029-04-10');
    expect(await screen.findByRole('heading', { name: 'Wellington' })).toBeVisible();
    expect(await screen.findByText('Neighbour source')).toBeVisible();
    expect(screen.queryByText('Foreign source')).toBeNull();
    expect(screen.getByRole('article', { name: 'Stay editor' })).toHaveClass('border-dashed');
    expect(screen.getByText('Source label: Cedar host')).toBeInTheDocument();
    expect(screen.getByText('pops:documents/document/unavailable')).toBeVisible();
    expect(transport.patches).toEqual([]);
  });

  it('saves one date or clock at a time, preserves other timing facts and removes only an explicitly cleared date', async () => {
    const initial = sourceStay();
    const changed = sourceStay({ timing: { ...initial.timing, arrival: '2029-06-01' } });
    const { arrival: removed, ...remaining } = changed.timing;
    expect(removed).toBe('2029-06-01');
    const cleared = sourceStay({ timing: remaining });
    const transport = workspaceTransport({
      patches: [
        { status: 200, body: changed },
        { status: 200, body: cleared },
      ],
    });
    mount(transport);
    await edit('Check-in date', '2029-06-01');
    await waitFor(() => expect(transport.patches).toEqual([{ timing: changed.timing }]));
    await saved();
    await edit('Check-in date', '');
    await waitFor(() =>
      expect(transport.patches).toEqual([{ timing: changed.timing }, { timing: remaining }])
    );
    await saved();
    expect(screen.getByLabelText('Check-in date')).toHaveValue('');
    expect(screen.getByLabelText('Check-out date')).toHaveValue(initial.timing.departure);
    expect(screen.getByLabelText('Time zone')).toHaveValue(initial.timing.timeZone);
  });

  it('persists explicit Purchased styling and reverses the successful source edit through the real patch shape', async () => {
    const initial = sourceStay();
    const purchased = sourceStay({ status: 'Purchased' });
    const transport = workspaceTransport({
      patches: [
        { status: 200, body: purchased },
        { status: 200, body: initial },
      ],
    });
    mount(transport);
    fireEvent.change(await screen.findByLabelText('Stay status'), {
      target: { value: 'Purchased' },
    });
    await waitFor(() =>
      expect(screen.getByRole('article', { name: 'Stay editor' })).toHaveClass('border-l-4')
    );
    await saved();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(transport.patches).toEqual([{ status: 'Purchased' }, staySource(initial)])
    );
    await saved();
    expect(screen.getByLabelText('Stay status')).toHaveValue('Reserved');
    expect(screen.getByRole('article', { name: 'Stay editor' })).toHaveClass('border-dashed');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('keeps opaque references on unrelated edits and removes only the explicitly selected reference', async () => {
    const initial = sourceStay();
    const named = sourceStay({ name: 'Edited source' });
    const unlinked = sourceStay({ name: named.name, hostLinks: [] });
    const transport = workspaceTransport({
      patches: [
        { status: 200, body: named },
        { status: 200, body: unlinked },
      ],
    });
    mount(transport);
    await edit('Stay name', 'Edited source');
    await saved();
    expect(transport.patches).toEqual([{ name: 'Edited source' }]);
    expect(screen.getByText('Source label: Cedar host')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove host link 1' }));
    await waitFor(() =>
      expect(transport.patches).toEqual([{ name: 'Edited source' }, { hostLinks: [] }])
    );
    await saved();
    expect(screen.queryByText('Source label: Cedar host')).toBeNull();
    expect(screen.getByText(initial.documentLinks[0]?.uri ?? '')).toBeVisible();
  });

  it('preserves failed drafts with safe diagnostics and retries the same explicit change', async () => {
    const edited = sourceStay({ name: 'Retry this source' });
    const transport = workspaceTransport({
      patches: [
        { status: 503, body: problem('trips.temporarily_unavailable') },
        { status: 200, body: edited },
      ],
    });
    mount(transport);
    await edit('Stay name', 'Retry this source');
    expect(await screen.findByText('trips.temporarily_unavailable')).toBeVisible();
    expect(screen.getByLabelText('Stay name')).toHaveValue('Retry this source');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(transport.patches).toEqual([
        { name: 'Retry this source' },
        { name: 'Retry this source' },
      ])
    );
    await saved();
    expect(screen.queryByText('trips.temporarily_unavailable')).toBeNull();
    expect(screen.getByLabelText('Stay name')).toHaveValue('Retry this source');
  });

  it('keeps a failed field when a different field is subsequently saved', async () => {
    const result = sourceStay({ name: 'Retain failed name', address: 'Changed address' });
    const transport = workspaceTransport({
      patches: [
        { status: 400, body: problem() },
        { status: 200, body: result },
      ],
    });
    mount(transport);
    await edit('Stay name', 'Retain failed name');
    await screen.findByText('trips.request.invalid');
    await edit('Address', 'Changed address');
    await waitFor(() =>
      expect(transport.patches.at(-1)).toEqual({
        name: 'Retain failed name',
        address: 'Changed address',
      })
    );
    await saved();
    expect(screen.getByLabelText('Stay name')).toHaveValue('Retain failed name');
  });

  it('supports empty/independent source fields and leaves context failures non-blocking', async () => {
    const empty = sourceStay({ name: null, kind: null, status: null, visitId: null, timing: {} });
    const result = sourceStay({ ...empty, timing: { checkOut: '23:59' } });
    const transport = workspaceTransport({
      stay: empty,
      failContext: true,
      patches: [{ status: 200, body: result }],
    });
    mount(transport);
    expect(await screen.findByLabelText('Stay kind')).toHaveValue('');
    expect(screen.getByLabelText('Stay status')).toHaveValue('');
    expect(screen.getByLabelText('Check-in date')).toHaveValue('');
    expect(screen.getByLabelText('Time zone')).toHaveValue('');
    expect(await screen.findByRole('region', { name: 'Visit context unavailable' })).toBeVisible();
    await edit('Check-out time', '23:59');
    await waitFor(() => expect(transport.patches).toEqual([{ timing: { checkOut: '23:59' } }]));
    await saved();
    expect(screen.getByLabelText('Check-out time')).toHaveValue('23:59');
  });

  it('renders auth failure diagnostics, retries source loading and never mounts empty editable data on failure', async () => {
    const transport = workspaceTransport({
      gets: [{ status: 401, body: problem('trips.authentication.required') }],
    });
    mount(transport);
    expect(await screen.findByText('trips.authentication.required')).toBeVisible();
    expect(screen.queryByLabelText('Stay name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Stay name')).toHaveValue('Cedar guesthouse');
    expect(transport.patches).toEqual([]);
  });

  it('retains successful history when undo fails and retries that source restoration', async () => {
    const initial = sourceStay();
    const named = sourceStay({ name: 'Changed source' });
    const transport = workspaceTransport({
      patches: [
        { status: 200, body: named },
        { status: 503, body: problem('trips.temporarily_unavailable') },
        { status: 200, body: initial },
      ],
    });
    mount(transport);
    await edit('Stay name', 'Changed source');
    await saved();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByText('trips.temporarily_unavailable');
    expect(screen.getByLabelText('Stay name')).toHaveValue(initial.name);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(transport.patches).toEqual([
        { name: 'Changed source' },
        staySource(initial),
        staySource(initial),
      ])
    );
    await saved();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('does not claim an in-progress draft is saved before blur commits it', async () => {
    const transport = workspaceTransport();
    mount(transport);
    const field = await screen.findByLabelText('Stay name');
    fireEvent.change(field, { target: { value: 'Uncommitted source' } });
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    expect(screen.queryByText('Changes saved')).toBeNull();
    expect(transport.patches).toEqual([]);
  });

  it('remounts from the latest persisted source rather than an obsolete cached snapshot', async () => {
    const changed = sourceStay({ name: 'Persisted source' });
    const transport = workspaceTransport({ patches: [{ status: 200, body: changed }] });
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 60_000 } },
    });
    const first = mount(transport, undefined, cache);
    await screen.findByLabelText('Stay name');
    transport.setSource(changed);
    await edit('Stay name', 'Persisted source');
    await saved();
    await waitFor(() =>
      expect(cache.getQueryData(['trips', 'http://trips.test', 7, 'stays'])).toEqual([changed])
    );
    first.unmount();
    mount(transport, undefined, cache);
    await waitFor(() => expect(screen.getByLabelText('Stay name')).toHaveValue('Persisted source'));
  });

  it('refreshes an untouched source while preserving a locally edited draft on background reads', async () => {
    const transport = workspaceTransport();
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(transport, undefined, cache);
    await screen.findByLabelText('Stay name');
    transport.setSource(
      sourceStay({ name: 'Fresh source read', updatedAt: '2029-01-02T00:00:00Z' })
    );
    await act(() =>
      cache.refetchQueries({ queryKey: ['trips', 'http://trips.test', 7, 'stay', 13] })
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Stay name')).toHaveValue('Fresh source read')
    );
    fireEvent.change(screen.getByLabelText('Stay name'), { target: { value: 'Keep local draft' } });
    transport.setSource(
      sourceStay({ name: 'Another source read', updatedAt: '2029-01-03T00:00:00Z' })
    );
    await act(() =>
      cache.refetchQueries({ queryKey: ['trips', 'http://trips.test', 7, 'stay', 13] })
    );
    expect(screen.getByLabelText('Stay name')).toHaveValue('Keep local draft');
    expect(screen.getByText('Unsaved changes')).toBeVisible();
  });

  it('resets the editor when the host switches to an already cached source origin', async () => {
    const first = workspaceTransport();
    const otherSource = sourceStay({ name: 'Other origin source' });
    const other = workspaceTransport({ stay: otherSource });
    other.client.setConfig({ baseUrl: 'http://other-trips.test' });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    cache.setQueryData(['trips', 'http://other-trips.test', 7, 'stay', 13], otherSource);
    const view = mount(first, undefined, cache);
    expect(await screen.findByLabelText('Stay name')).toHaveValue('Cedar guesthouse');
    fireEvent.change(screen.getByLabelText('Stay name'), {
      target: { value: 'First origin draft' },
    });
    view.rerender(
      <QueryClientProvider client={cache}>
        <StayWorkspace formatNights={testNightLabel} tripId={7} stayId={13} client={other.client} />
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Stay name')).toHaveValue('Other origin source')
    );
    expect(first.patches).toEqual([]);
    expect(other.patches).toEqual([]);
  });

  it('rejects invalid host-supplied identities before issuing any source or context request', async () => {
    const transport = workspaceTransport();
    mount(transport, { tripId: 0, stayId: -1 });
    expect(screen.getByText('trips.identity.invalid')).toBeVisible();
    expect(transport.requests).toHaveLength(0);
  });
});
