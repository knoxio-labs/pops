import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  triggerSync: vi.fn(),
  getSyncJob: vi.fn(),
}));

vi.mock('../../finance-api/index.js', () => ({
  accountImportsTriggerSync: (...args: unknown[]) => mocks.triggerSync(...args),
  accountImportsGetSyncJob: (...args: unknown[]) => mocks.getSyncJob(...args),
}));

import { BackfillRange } from './BackfillRange';
import { ImportActions } from './ImportActions';

import type { ReactNode } from 'react';

import type { ImportConfigWire } from './types';

const UP_CONFIG: ImportConfigWire = {
  accountId: 'acc-up',
  sourceKind: 'api',
  dialectId: null,
  parserId: null,
  provider: 'up',
  externalAccountRef: null,
  expectedCadenceDays: null,
  secretRef: 'up-token',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response() };
}

function job(status: 'running' | 'failed', error: string | null = null) {
  return {
    id: 'job-1',
    accountId: 'acc-up',
    trigger: 'manual',
    status,
    from: '2026-09-01',
    to: '2026-09-30',
    startedAt: '2026-09-13T00:00:00.000Z',
    finishedAt: null,
    result: null,
    error,
  };
}

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.triggerSync.mockResolvedValue(ok({ data: job('running') }));
  mocks.getSyncJob.mockResolvedValue(ok({ data: job('failed', 'Up rejected the token.') }));
});

describe('a failed Up sync on the account imports page (POPS-3657)', () => {
  it('Sync now says why it failed', async () => {
    renderWithClient(<ImportActions accountId="acc-up" config={UP_CONFIG} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    expect(await screen.findByText('Up rejected the token.')).toBeDefined();
    expect(screen.queryByText('Up had nothing new.')).toBeNull();
  });

  it('Backfill says why it failed', async () => {
    renderWithClient(<BackfillRange accountId="acc-up" config={UP_CONFIG} />);

    fireEvent.click(screen.getByRole('button', { name: 'Backfill' }));

    expect(await screen.findByText('Up rejected the token.')).toBeDefined();
    expect(screen.queryByText('Up had nothing in that range.')).toBeNull();
  });
});
