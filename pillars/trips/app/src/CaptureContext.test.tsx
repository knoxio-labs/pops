import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { captureOwner } from './capture-context-fixture';

import type { ContactsHostCapability } from '@pops/pillar-sdk';

let owner: Awaited<ReturnType<typeof captureOwner>>;
beforeEach(async () => {
  owner = await captureOwner();
});
afterEach(async () => {
  cleanup();
  await owner.close();
});

it('embeds the actual public context without a router, destination navigation or another page landmark', async () => {
  owner.mount();
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toBeVisible();
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 2, name: 'Capture' })).toBeVisible();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(owner.requests).toEqual(
    expect.arrayContaining([expect.objectContaining({ path: '/trips/7/capture-workspace' })])
  );
});

it('retains verbatim text and distinct selected Files across controlled contextual remounts', async () => {
  const user = userEvent.setup();
  const first = owner.mount();
  const raw = '  Raw 東京 source\nsecond line  ';
  await user.type(await screen.findByRole('textbox', { name: 'Capture text' }), raw);
  const input = first.container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing file selection');
  await user.upload(input, [
    new File(['one'], 'same.txt', { type: 'text/plain' }),
    new File(['two'], 'same.txt', { type: 'text/plain' }),
  ]);
  expect(await screen.findAllByRole('region', { name: 'Upload same.txt' })).toHaveLength(2);
  first.unmount();
  const inbox = owner.mount({ view: 'inbox' });
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toHaveValue(raw);
  expect(screen.getAllByRole('region', { name: 'Upload same.txt' })).toHaveLength(2);
  inbox.unmount();
  owner.mount({ view: 'explore' });
  expect(await screen.findByRole('textbox', { name: 'Save possibility' })).toHaveValue(raw);
  expect(screen.getAllByRole('region', { name: 'Upload same.txt' })).toHaveLength(2);
  expect(owner.requests.filter((request) => request.method === 'POST')).toEqual([]);
});

it('isolates trip and transport ownership while restoring the original trip context draft', async () => {
  const user = userEvent.setup();
  const first = owner.mount();
  await user.type(await screen.findByRole('textbox', { name: 'Capture text' }), 'Trip seven raw');
  first.unmount();
  const anotherTrip = owner.mount({ tripId: 8 });
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toHaveValue('');
  anotherTrip.unmount();
  const anotherOrigin = owner.mount({ client: owner.alternateClient });
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toHaveValue('');
  anotherOrigin.unmount();
  owner.mount();
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toHaveValue(
    'Trip seven raw'
  );
});

it('retries only the exact unknown command after remount without a new capture operation', async () => {
  const user = userEvent.setup();
  owner.loseNextWrite();
  const first = owner.mount();
  await user.type(
    await screen.findByRole('textbox', { name: 'Capture text' }),
    ' Verbatim command 🧭 '
  );
  await user.click(screen.getByRole('button', { name: 'Capture' }));
  expect(await screen.findByRole('button', { name: 'Retry Capture' })).toBeVisible();
  expect(owner.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  first.unmount();
  owner.mount({ view: 'inbox' });
  await user.click(await screen.findByRole('button', { name: 'Retry Capture' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Retry Capture' })).not.toBeInTheDocument()
  );
  const posts = owner.requests.filter((request) => request.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  expect(posts[0]?.body).toMatchObject({
    command: { kind: 'capture.create', input: { originalText: ' Verbatim command 🧭 ' } },
  });
});

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid owning trip %s before any source request',
  async (tripId) => {
    owner.mount({ tripId });
    expect(screen.getByText('Choose a valid trip')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(owner.requests).toEqual([]);
  }
);

it('delegates an actual saved Event identity to the owning host callback without route inference', async () => {
  owner.source.events.push({
    id: 77,
    tripId: 7,
    visitId: null,
    name: 'An explicitly saved event',
    intention: null,
    arrangement: null,
    purchase: null,
    timing: {},
    address: null,
    reference: null,
    sourceUrl: null,
    ticketUrl: null,
    notes: '',
    sourceLinks: [],
    venueLinks: [],
    organiserLinks: [],
    documentLinks: [],
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  });
  owner.source.memberships.push({
    id: 5,
    tripId: 7,
    source: { kind: 'event', id: 77 },
    revision: 1,
    removedAt: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  });
  const opened: number[] = [];
  owner.mount({ view: 'explore', onViewEvent: (id) => opened.push(id) });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Open Event 77' }));
  expect(opened).toEqual([77]);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

it('retains the injected owner chooser intent across contextual unmounts without another factory call', async () => {
  owner.source.captures.push({
    id: 19,
    tripId: 7,
    originalText: 'Explicit raw source',
    originalUrl: null,
    title: null,
    notes: '',
    classification: null,
    placeId: null,
    visitId: null,
    attachments: [],
    revision: 1,
    removedAt: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  });
  let factories = 0;
  const contacts: ContactsHostCapability = {
    createIntent: () => {
      factories++;
      return {
        Chooser: ({ open }) =>
          open ? (
            <div role="dialog" aria-label="Retained owner intent">
              Owner operation pending
            </div>
          ) : null,
      };
    },
  };
  const user = userEvent.setup();
  const first = owner.mount({ view: 'inbox', contacts });
  await user.click(await screen.findByText('Organise', { exact: true }));
  await user.click(screen.getByRole('button', { name: 'Choose contact' }));
  expect(await screen.findByRole('dialog', { name: 'Retained owner intent' })).toBeVisible();
  first.unmount();
  owner.mount({ view: 'explore', contacts });
  expect(await screen.findByRole('dialog', { name: 'Retained owner intent' })).toBeVisible();
  expect(factories).toBe(1);
  expect(owner.requests.filter((request) => request.method === 'POST')).toEqual([]);
});
