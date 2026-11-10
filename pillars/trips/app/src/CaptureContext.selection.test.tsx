import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { captureOwner } from './capture-context-fixture';
import { createClient } from './trips-api/client';

import type { CaptureSourceSelection } from './index';

let owner: Awaited<ReturnType<typeof captureOwner>>;
beforeEach(async () => {
  owner = await captureOwner();
  owner.source.captures.push({
    id: 19,
    tripId: 7,
    originalText: '  Exact raw 東京  ',
    originalUrl: null,
    title: 'Capture title',
    notes: '',
    classification: null,
    placeId: null,
    visitId: null,
    attachments: [],
    revision: 1,
    removedAt: null,
    createdAt: '',
    updatedAt: '',
  });
  owner.source.ideas.push({
    id: 19,
    tripId: 7,
    name: 'Idea title',
    kind: null,
    purpose: null,
    status: null,
    reason: '',
    notes: '',
    address: null,
    placeId: null,
    visitId: null,
    timing: { mode: 'none' },
    sourceLinks: [],
    contactLinks: [],
    recommendations: [],
    revision: 1,
    removedAt: null,
    createdAt: '',
    updatedAt: '',
  });
});
afterEach(async () => {
  cleanup();
  await owner.close();
});

it('opens only the exact tagged source, expands its existing editor and retains distinct drafts on remount', async () => {
  const capture = owner.mount({ view: 'explore', selectedSource: { kind: 'capture', id: 19 } });
  expect(await screen.findByRole('textbox', { name: 'Capture title' })).toBeVisible();
  expect(screen.getByText('Exact raw 東京', { exact: false })).toBeVisible();
  expect(screen.queryByRole('textbox', { name: 'Idea name' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Save possibility' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Capture title' }), {
    target: { value: 'Retained capture edit' },
  });
  capture.unmount();
  const idea = owner.mount({ selectedSource: { kind: 'idea', id: 19 } });
  expect(await screen.findByRole('textbox', { name: 'Idea name' })).toBeVisible();
  expect(screen.queryByRole('textbox', { name: 'Capture title' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Idea name' }), {
    target: { value: 'Retained Idea edit' },
  });
  idea.unmount();
  const again = owner.mount({ selectedSource: { kind: 'capture', id: 19 } });
  expect(await screen.findByRole('textbox', { name: 'Capture title' })).toHaveValue(
    'Retained capture edit'
  );
  again.unmount();
  owner.mount({ selectedSource: { kind: 'idea', id: 19 } });
  expect(await screen.findByRole('textbox', { name: 'Idea name' })).toHaveValue(
    'Retained Idea edit'
  );
  expect(owner.requests.filter((request) => request.method === 'POST')).toEqual([]);
  expect(owner.source.memberships).toEqual([]);
});

it.each<CaptureSourceSelection>([
  { kind: 'capture', id: 20 },
  { kind: 'idea', id: 20 },
])('never falls back from missing $kind $id to a different source', async (selectedSource) => {
  owner.mount({ selectedSource });
  expect(
    await screen.findByText(`The selected ${selectedSource.kind} 20 is unavailable.`)
  ).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(owner.requests.filter((request) => request.method === 'POST')).toEqual([]);
});

it('keeps exact-source drafts separate for identical IDs at different owner origins', async () => {
  const first = owner.mount({ selectedSource: { kind: 'capture', id: 19 } });
  fireEvent.change(await screen.findByRole('textbox', { name: 'Capture title' }), {
    target: { value: 'Owner A draft' },
  });
  first.unmount();
  const alternate = owner.mount({
    client: owner.alternateClient,
    selectedSource: { kind: 'capture', id: 19 },
  });
  expect(await screen.findByRole('textbox', { name: 'Capture title' })).toHaveValue(
    'Capture title'
  );
  alternate.unmount();
  owner.mount({ selectedSource: { kind: 'capture', id: 19 } });
  expect(await screen.findByRole('textbox', { name: 'Capture title' })).toHaveValue(
    'Owner A draft'
  );
  expect(owner.requests.filter((request) => request.method === 'POST')).toEqual([]);
});

it.each(['capture', 'idea'] as const)(
  'does not edit a removed %s or borrow the same ID from another trip',
  async (kind) => {
    const row = kind === 'capture' ? owner.source.captures[0] : owner.source.ideas[0];
    if (!row) throw new Error('Missing explicit source fixture');
    row.removedAt = '2026-11-11T00:00:00.000Z';
    const removed = owner.mount({ selectedSource: { kind, id: 19 } });
    expect(await screen.findByText(`The selected ${kind} 19 is unavailable.`)).toBeVisible();
    removed.unmount();
    const anotherTrip = owner.mount({ tripId: 8, selectedSource: { kind, id: 19 } });
    expect(await screen.findByText(`The selected ${kind} 19 is unavailable.`)).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    anotherTrip.unmount();
  }
);

it('keeps an unknown composer request through source selection and exact retry after a same-origin transport replacement', async () => {
  owner.loseNextWrite();
  const user = userEvent.setup();
  const first = owner.mount();
  await user.type(
    await screen.findByRole('textbox', { name: 'Capture text' }),
    ' Verbatim pending 🧭 '
  );
  await user.click(screen.getByRole('button', { name: 'Capture' }));
  expect(await screen.findByRole('button', { name: 'Retry Capture' })).toBeVisible();
  first.unmount();
  const selected = owner.mount({
    client: createClient({ baseUrl: owner.client.getConfig().baseUrl }),
    selectedSource: { kind: 'idea', id: 19 },
  });
  expect(await screen.findByRole('textbox', { name: 'Idea name' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Retry Capture' })).toBeVisible();
  selected.unmount();
  const ordinary = owner.mount({ selectedSource: null });
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toHaveValue(
    ' Verbatim pending 🧭 '
  );
  await user.click(screen.getByRole('button', { name: 'Retry Capture' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Retry Capture' })).not.toBeInTheDocument()
  );
  const posts = owner.requests.filter((request) => request.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  ordinary.unmount();
  owner.mount();
  expect(await screen.findByRole('textbox', { name: 'Capture text' })).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
});
