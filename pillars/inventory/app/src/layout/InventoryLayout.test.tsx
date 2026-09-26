import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UNDO_WINDOW_MS, showUndoToast } from '../foundation/feedback/undo-toast';
import { InventoryLayout } from './InventoryLayout';

const custom = vi.hoisted(() => vi.fn());
const dismiss = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: { custom, dismiss },
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderLayout(initialEntry = '/inventory') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/inventory" element={<InventoryLayout />}>
          <Route index element={<div>Overview page</div>} />
          <Route path="items" element={<div>Items page</div>} />
          <Route path="items/new" element={<div>New item page</div>} />
          <Route path="items/bulk-new" element={<div>Bulk entry page</div>} />
          <Route path="sync" element={<div>Sync page</div>} />
        </Route>
      </Routes>
      <LocationDisplay />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  custom.mockReturnValue('toast');
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

describe('InventoryLayout', () => {
  it('g then i navigates to /inventory/items', () => {
    renderLayout();
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 'i' });
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory/items');
    expect(screen.getByText('Items page')).toBeInTheDocument();
  });

  it('? opens the Keyboard shortcuts sheet', () => {
    renderLayout();
    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Cmd-Z undoes the newest offered toast and is not prevented without one', async () => {
    renderLayout();

    const noOffer = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(noOffer);
    expect(noOffer.defaultPrevented).toBe(false);

    const olderUndo = vi.fn().mockResolvedValue(undefined);
    const newestUndo = vi.fn().mockResolvedValue(undefined);
    showUndoToast({ concept: 'move', message: 'Moved an item', onUndo: olderUndo });
    showUndoToast({ concept: 'move', message: 'Moved the newest item', onUndo: newestUndo });

    const offered = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(offered);
    expect(offered.defaultPrevented).toBe(true);
    expect(newestUndo).toHaveBeenCalledOnce();
    expect(olderUndo).not.toHaveBeenCalled();

    await act(async () => undefined);
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS));
  });

  it('renders the matched page inside the layout', () => {
    renderLayout('/inventory/items');
    expect(screen.getByText('Items page')).toBeInTheDocument();
  });

  it('leaves Cmd-K to a document-level listener while no openPalette is given', () => {
    const listener = vi.fn();
    document.addEventListener('keydown', listener);
    renderLayout();

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);

    expect(listener).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory');
    document.removeEventListener('keydown', listener);
  });
});
