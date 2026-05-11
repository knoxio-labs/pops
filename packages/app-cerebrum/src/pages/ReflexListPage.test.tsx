import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListQuery = vi.fn();
const mockEnableMutate = vi.fn();
const mockDisableMutate = vi.fn();
const mockTestMutate = vi.fn();
const invalidateList = vi.fn().mockResolvedValue(undefined);

vi.mock('@pops/api-client', () => ({
  trpc: {
    useUtils: () => ({
      cerebrum: {
        reflex: { list: { invalidate: invalidateList } },
      },
    }),
    cerebrum: {
      reflex: {
        list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
        enable: {
          useMutation: () => ({ mutate: mockEnableMutate, isPending: false, error: null }),
        },
        disable: {
          useMutation: () => ({ mutate: mockDisableMutate, isPending: false, error: null }),
        },
        test: {
          useMutation: () => ({ mutate: mockTestMutate, isPending: false, error: null }),
        },
      },
    },
  },
}));

import { ReflexListPage } from './ReflexListPage';

import type { ReflexWithStatus } from '../reflex/types';

function buildReflex(overrides: Partial<ReflexWithStatus> = {}): ReflexWithStatus {
  return {
    name: 'consolidate-notes',
    description: 'Consolidates similar notes',
    enabled: true,
    trigger: { type: 'event', event: 'engram.created' },
    action: { type: 'glia', verb: 'consolidate' },
    lastExecutionAt: '2026-05-11T01:00:00Z',
    nextFireTime: null,
    executionCount: 3,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReflexListPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReflexListPage', () => {
  it('renders the loading skeleton while the list query is in flight', () => {
    mockListQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('reflex-loading')).toBeInTheDocument();
  });

  it('renders the empty state when no reflexes are configured', () => {
    mockListQuery.mockReturnValue({
      data: { reflexes: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('No reflexes configured')).toBeInTheDocument();
  });

  it('renders an error state with retry when the query fails', async () => {
    const refetch = vi.fn();
    mockListQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'boom' },
      refetch,
    });
    renderPage();
    expect(screen.getByTestId('reflex-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('lists reflex rows and fires the test mutation on demand', async () => {
    mockListQuery.mockReturnValue({
      data: {
        reflexes: [buildReflex(), buildReflex({ name: 'nightly-summary', enabled: false })],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getAllByTestId('reflex-row')).toHaveLength(2);
    const fireButtons = screen.getAllByRole('button', { name: /fire/i });
    const firstFire = fireButtons[0];
    expect(firstFire).toBeDefined();
    if (firstFire) await userEvent.click(firstFire);
    expect(mockTestMutate).toHaveBeenCalledWith({ name: 'consolidate-notes' });
  });

  it('toggles enable and disable mutations from the row switch', async () => {
    mockListQuery.mockReturnValue({
      data: {
        reflexes: [
          buildReflex({ name: 'a', enabled: true }),
          buildReflex({ name: 'b', enabled: false }),
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    const switches = screen.getAllByRole('switch');
    const first = switches[0];
    const second = switches[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first) await userEvent.click(first);
    expect(mockDisableMutate).toHaveBeenCalledWith({ name: 'a' });
    if (second) await userEvent.click(second);
    expect(mockEnableMutate).toHaveBeenCalledWith({ name: 'b' });
  });
});
