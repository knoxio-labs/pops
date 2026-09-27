import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComponentProps } from 'react';

const mocks = vi.hoisted(() => ({
  useItemRows: vi.fn(),
}));

vi.mock('../../inventory-web/useWebItems.js', () => ({
  useItemRows: (...args: unknown[]) => mocks.useItemRows(...args),
}));

import { InventoryApiError } from '../../inventory-api-helpers.js';
import { WireItemsSheet } from './wire-items-sheet.js';

import type { ItemRowModel } from '../../foundation/model/model.js';

function item(id: string, name: string, overrides: Partial<ItemRowModel> = {}): ItemRowModel {
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
    ...overrides,
  };
}

const rows = [
  item('item-active', 'Active lamp'),
  item('item-retired', 'Retired lamp', { lifecycle: 'retired' }),
  item('item-wired', 'Already wired lamp'),
];

function renderSheet(overrides: Partial<ComponentProps<typeof WireItemsSheet>> = {}) {
  const onWire = overrides.onWire ?? vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <WireItemsSheet
      open
      onOpenChange={onOpenChange}
      fixture={{ id: 'fixture-1', name: 'Desk outlet' }}
      wiredIds={new Set(['item-wired'])}
      online
      onWire={onWire}
      {...overrides}
    />
  );
  return { onWire, onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useItemRows.mockReturnValue({
    rows,
    total: rows.length,
    unfilteredTotal: rows.length,
    hiddenInactiveCount: 0,
    baseline: rows.length,
    hidden: 0,
    contentCounts: {},
    status: 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  });
});

describe('WireItemsSheet', () => {
  it('shows refusal reasons and wires only selected active items', async () => {
    const { onWire, onOpenChange } = renderSheet();

    expect(screen.getByText('Retired lamp is retired.')).toBeInTheDocument();
    expect(screen.getByText('Already wired here.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /Active lamp/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Wire 1 item' }));

    await waitFor(() =>
      expect(onWire).toHaveBeenCalledWith([{ id: 'item-active', name: 'Active lamp' }])
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables all writes offline', () => {
    renderSheet({ online: false });

    expect(screen.getByText('Wiring is unavailable offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wire/ })).toBeDisabled();
  });

  it('shows a retry action when the item source fails', () => {
    const refetch = vi.fn();
    mocks.useItemRows.mockReturnValue({
      rows: [],
      total: null,
      status: 'error',
      error: new Error('unavailable'),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch,
    });
    renderSheet();

    expect(screen.getByText('Items did not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('keeps the sheet open after a conflict from the sequential wire action', async () => {
    const onOpenChange = vi.fn();
    const onWire = vi.fn().mockRejectedValue(new InventoryApiError('already wired', 409));
    renderSheet({ onOpenChange, onWire });

    fireEvent.click(screen.getByRole('option', { name: /Active lamp/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Wire 1 item' }));

    await waitFor(() => expect(onWire).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
