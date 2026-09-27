import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useFixtureDetailPageModel: vi.fn(),
  showUndoToast: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('./fixtures-page-model.js', () => ({
  useFixtureDetailPageModel: (...args: unknown[]) => mocks.useFixtureDetailPageModel(...args),
}));
vi.mock('./fixture-form-dialog.js', () => ({ FixtureFormDialog: () => null }));
vi.mock('./wire-items-sheet.js', () => ({ WireItemsSheet: () => null }));
vi.mock('../../foundation/feedback/undo-toast.js', () => ({
  showUndoToast: (...args: unknown[]) => mocks.showUndoToast(...args),
}));
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => mocks.toastError(...args) } }));

import { FixtureDetailPage } from './FixtureDetailPage.js';

import type { ItemRowModel } from '../../foundation/model/model.js';

const fixture = {
  createdAt: '2026-09-01T00:00:00.000Z',
  id: 'fixture-1',
  lastEditedTime: '2026-09-02T00:00:00.000Z',
  locationId: 'room-1',
  name: 'Desk outlet',
  notes: 'Behind the desk',
  type: 'power',
};

function item(id: string, name: string): ItemRowModel {
  return {
    id,
    name,
    typeId: null,
    typeName: 'Lighting',
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement: { kind: 'location', locationId: 'room-1' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function pageModel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fixture-1',
    fixture,
    items: {
      items: [item('item-1', 'Desk lamp')],
      total: 1,
      status: 'success' as const,
      error: null,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    },
    locations: {
      locations: [{ id: 'room-1', name: 'Office', parentId: null, kind: 'room' as const }],
      status: 'success' as const,
      refetch: vi.fn(),
    },
    online: true,
    changed: { stale: false, groups: [], reload: vi.fn() },
    mutations: { save: vi.fn().mockResolvedValue(undefined) },
    connectionMutations: {
      connectFixture: vi.fn().mockResolvedValue(undefined),
      disconnectFixture: vi.fn().mockResolvedValue(undefined),
    },
    status: 'success' as const,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

function renderPage(model = pageModel()): void {
  mocks.useFixtureDetailPageModel.mockReturnValue(model);
  render(
    <MemoryRouter initialEntries={['/inventory/fixtures/fixture-1']}>
      <Routes>
        <Route path="/inventory/fixtures/:id" element={<FixtureDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FixtureDetailPage', () => {
  it('shows facts and disconnects selected wired items with one undo offer', async () => {
    const model = pageModel();
    renderPage(model);

    expect(screen.getByRole('heading', { name: 'Desk outlet' })).toBeInTheDocument();
    expect(screen.getAllByText('Office').length).toBeGreaterThan(0);
    expect(screen.getByText('Desk lamp')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Desk lamp' }));
    const selection = screen.getByRole('region', { name: 'Selection' });
    fireEvent.click(within(selection).getByRole('button', { name: 'Disconnect' }));

    await waitFor(() =>
      expect(model.connectionMutations.disconnectFixture).toHaveBeenCalledWith(
        'item-1',
        'fixture-1'
      )
    );
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({
        concept: 'connection',
        message: 'Disconnected Desk lamp from Desk outlet',
      })
    );
  });

  it('keeps edit and disconnect actions refused while offline', () => {
    const model = pageModel({ online: false });
    renderPage(model);

    expect(screen.getByText('No connection. Showing what loaded.')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: 'Edit fixture' })) {
      expect(button).toBeDisabled();
    }
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Desk lamp' }));
    expect(
      within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', {
        name: 'Disconnect',
      })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders loading, stale, and not-found states from the model', () => {
    const loading = pageModel({ status: 'pending', fixture: undefined });
    mocks.useFixtureDetailPageModel.mockReturnValue(loading);
    const { rerender } = render(
      <MemoryRouter initialEntries={['/inventory/fixtures/fixture-1']}>
        <Routes>
          <Route path="/inventory/fixtures/:id" element={<FixtureDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('status', { name: 'Loading fixture' })).toBeInTheDocument();

    const stale = pageModel({ changed: { stale: true, groups: [{}], reload: vi.fn() } });
    mocks.useFixtureDetailPageModel.mockReturnValue(stale);
    rerender(
      <MemoryRouter initialEntries={['/inventory/fixtures/fixture-1']}>
        <Routes>
          <Route path="/inventory/fixtures/:id" element={<FixtureDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('This fixture changed elsewhere since it loaded')).toBeInTheDocument();

    const notFound = pageModel({
      fixture: undefined,
      status: 'error',
      error: new Error('missing'),
    });
    mocks.useFixtureDetailPageModel.mockReturnValue(notFound);
    rerender(
      <MemoryRouter initialEntries={['/inventory/fixtures/fixture-1']}>
        <Routes>
          <Route path="/inventory/fixtures/:id" element={<FixtureDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Fixture not found')).toBeInTheDocument();
  });
});
