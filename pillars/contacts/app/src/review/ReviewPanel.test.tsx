import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { ReviewPanel } from './ReviewPanel';
import { noReadyRows } from './test-fixtures';

import type { ReviewGateway, ReviewSnapshot } from './contracts';
import type { ReviewItem } from './model';

function item(index: number): ReviewItem {
  return {
    id: `row-${index}`,
    proposalRevision: `proposal-${index}`,
    candidateTotal: 1,
    candidateOffset: 0,
    candidateLimit: 50,
    name: `Incoming ${index}`,
    source: 'vCard',
    status: index === 50 ? 'Ambiguous full name' : 'New person',
    errors: [],
    points: [],
    processed: false,
    candidates: [
      {
        id: `person-${index}`,
        entityId: `person-${index}`,
        localName: `Stored ${index}`,
        sourceOptions: [],
        name: `Stored ${index}`,
        points: [],
        sources: ['iCloud'],
        reasons: ['Complete name'],
        keepSeparate: false,
      },
    ],
  };
}

it('preserves choices through queue pages and submits the selected stable row and candidate IDs', async () => {
  const user = userEvent.setup();
  const snapshot: ReviewSnapshot = {
    batchId: 'batch',
    proposalRevision: 'global-proof',
    totalRows: 51,
    offset: 0,
    limit: 50,
    ready: noReadyRows,
    counts: { automatic: 0, review: 51, new: 0, invalid: 0 },
    batchRevision: 3,
    directoryRevision: 7,
    items: Array.from({ length: 51 }, (_, index) => item(index)),
  };
  const save = vi.fn<ReviewGateway['save']>().mockResolvedValue(undefined);
  const gateway: ReviewGateway = {
    applyReady: vi.fn().mockResolvedValue({ appliedRows: 0 }),
    load: vi.fn<ReviewGateway['load']>().mockImplementation(async (_batchId, page) => ({
      ...snapshot,
      offset: page?.offset ?? 0,
      items: snapshot.items.slice(page?.offset ?? 0, (page?.offset ?? 0) + 50),
    })),
    save,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewPanel batchId="batch" gateway={gateway} />
    </QueryClientProvider>
  );
  await screen.findByRole('heading', { name: 'Incoming 0' });
  await user.click(
    within(screen.getByRole('region', { name: 'Existing Stored 0' })).getByRole('checkbox')
  );
  const queue = within(screen.getByRole('navigation', { name: 'Incoming contact queue' }));
  await user.click(queue.getByRole('button', { name: /^Next$/ }));
  expect(await screen.findByRole('heading', { name: 'Incoming 50' })).toBeVisible();
  expect(screen.getAllByText('Ambiguous full name')).toHaveLength(2);
  await user.click(
    within(screen.getByRole('region', { name: 'Existing Stored 50' })).getByRole('checkbox')
  );
  await user.click(queue.getByRole('button', { name: 'Previous' }));
  await screen.findByRole('region', { name: 'Existing Stored 0' });
  expect(
    within(screen.getByRole('region', { name: 'Existing Stored 0' })).getByRole('checkbox')
  ).toBeChecked();
  await user.click(queue.getByRole('button', { name: /^Next$/ }));
  await screen.findByRole('region', { name: 'Existing Stored 50' });
  expect(
    within(screen.getByRole('region', { name: 'Existing Stored 50' })).getByRole('checkbox')
  ).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Merge 1 selected' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]?.[0]).toMatchObject({
    batchId: 'batch',
    rowId: 'row-50',
    batchRevision: 3,
    directoryRevision: 7,
    mergeEntityIds: ['person-50'],
    differentEntityIds: [],
  });
  await act(async () => {
    await Promise.resolve();
  });
});

it('retains selected candidates from earlier evidence pages in one stable-ID confirmation', async () => {
  const user = userEvent.setup();
  const first = item(0);
  const second = item(1).candidates[0];
  if (!second) throw new Error('Missing fixture candidate');
  const load = vi.fn<ReviewGateway['load']>().mockImplementation(async (_batchId, page) => ({
    batchId: 'batch',
    batchRevision: 4,
    directoryRevision: 8,
    proposalRevision: 'whole-snapshot',
    totalRows: 1,
    offset: 0,
    limit: 50,
    ready: noReadyRows,
    counts: { automatic: 0, review: 1, new: 0, invalid: 0 },
    items: [
      {
        ...first,
        candidateTotal: 2,
        candidateLimit: 1,
        candidateOffset: page?.candidateOffset ?? 0,
        candidates: page?.candidateOffset === 1 ? [second] : first.candidates,
      },
    ],
  }));
  const save = vi.fn<ReviewGateway['save']>().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewPanel
        batchId="batch"
        gateway={{ load, save, applyReady: vi.fn().mockResolvedValue({ appliedRows: 0 }) }}
      />
    </QueryClientProvider>
  );
  await user.click(await screen.findByRole('checkbox', { name: 'Stored 0' }));
  await user.click(screen.getByRole('button', { name: 'Next candidates' }));
  const secondRegion = within(await screen.findByRole('region', { name: 'Existing Stored 1' }));
  await user.click(secondRegion.getByRole('button', { name: 'Different person' }));
  await user.click(screen.getByRole('button', { name: 'Previous candidates' }));
  expect(await screen.findByRole('checkbox', { name: 'Stored 0' })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Merge 1 selected' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]?.[0]).toMatchObject({
    rowId: 'row-0',
    proposalRevision: 'proposal-0',
    mergeEntityIds: ['person-0'],
    differentEntityIds: ['person-1'],
  });
  expect(load).toHaveBeenCalledWith(
    'batch',
    expect.objectContaining({
      candidateRowId: 'row-0',
      candidateOffset: 1,
      proposalRevision: 'whole-snapshot',
    })
  );
});

it('applies off-page server-resolved contacts in one action while a persisted Later row stays pending', async () => {
  const user = userEvent.setup();
  const pending = { ...item(50), initialChoices: { 'person-50': 'later' as const } };
  const before: ReviewSnapshot = {
    batchId: 'batch',
    batchRevision: 2,
    directoryRevision: 7,
    proposalRevision: 'paging-proof',
    totalRows: 51,
    offset: 50,
    limit: 50,
    counts: { automatic: 1, new: 1, review: 49, invalid: 0 },
    ready: {
      ...noReadyRows,
      eligibleRows: 2,
      automaticMerges: 1,
      newPeople: 1,
      reviewRequired: 48,
      deferred: 1,
    },
    items: [pending],
  };
  const after = {
    ...before,
    batchRevision: 3,
    directoryRevision: 8,
    ready: { ...before.ready, eligibleRows: 0, alreadyProcessed: 2 },
  };
  const api: ReviewGateway = {
    load: vi.fn().mockResolvedValueOnce(before).mockResolvedValue(after),
    save: vi.fn(),
    applyReady: vi.fn().mockResolvedValue({ appliedRows: 2 }),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewPanel batchId="batch" gateway={api} />
    </QueryClientProvider>
  );
  const action = await screen.findByRole('button', { name: 'Import resolved contacts' });
  await waitFor(() => expect(action).toBeEnabled());
  expect(screen.getByText('Ready: 2')).toBeVisible();
  await user.click(action);
  await waitFor(() => expect(api.applyReady).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.applyReady).mock.calls[0]?.[0]).toMatchObject({
    batchId: 'batch',
    proposalRevision: 'ready-proof',
  });
  expect(api.save).not.toHaveBeenCalled();
  await screen.findByText(
    'Imported 2 resolved contacts. Contacts requiring review or saved for later remain pending.'
  );
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Review later' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(action).toBeDisabled();
});

it('blocks the global action while local candidate choices have not been saved', async () => {
  const user = userEvent.setup();
  const snapshot: ReviewSnapshot = {
    batchId: 'batch',
    batchRevision: 1,
    directoryRevision: 2,
    proposalRevision: 'paging',
    totalRows: 1,
    offset: 0,
    limit: 50,
    counts: { automatic: 0, new: 0, review: 1, invalid: 0 },
    ready: { ...noReadyRows, eligibleRows: 1 },
    items: [item(0)],
  };
  const api: ReviewGateway = {
    load: vi.fn().mockResolvedValue(snapshot),
    save: vi.fn(),
    applyReady: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewPanel batchId="batch" gateway={api} />
    </QueryClientProvider>
  );
  const candidate = await screen.findByRole('checkbox');
  await user.click(candidate);
  const action = screen.getByRole('button', { name: 'Import resolved contacts' });
  expect(action).toBeDisabled();
  expect(screen.getByText(/Save your current choices before importing/)).toBeVisible();
  await user.click(action);
  expect(api.applyReady).not.toHaveBeenCalled();
});

it('keeps another row’s unsaved Later choice after saving a separate row', async () => {
  const user = userEvent.setup();
  const snapshot: ReviewSnapshot = {
    batchId: 'batch',
    batchRevision: 1,
    directoryRevision: 2,
    proposalRevision: 'paging',
    totalRows: 2,
    offset: 0,
    limit: 50,
    counts: { automatic: 0, new: 0, review: 2, invalid: 0 },
    ready: { ...noReadyRows, eligibleRows: 1 },
    items: [item(0), item(1)],
  };
  const api: ReviewGateway = {
    load: vi.fn().mockResolvedValue(snapshot),
    save: vi.fn().mockResolvedValue(undefined),
    applyReady: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewPanel batchId="batch" gateway={api} />
    </QueryClientProvider>
  );
  await user.click(await screen.findByRole('button', { name: 'Review later' }));
  const queue = within(screen.getByRole('navigation', { name: 'Incoming contact queue' }));
  await user.click(queue.getByRole('button', { name: /Incoming 1/ }));
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Merge 1 selected' }));
  await screen.findByText('Decision saved. Deferred candidates remain available for review.');
  expect(screen.getByRole('button', { name: 'Review later' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(screen.getByRole('button', { name: 'Import resolved contacts' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Reload evidence' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Import resolved contacts' })).toBeEnabled()
  );
  expect(screen.getByRole('button', { name: 'Review later' })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
});
