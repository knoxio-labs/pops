import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _clearSearchDropdowns,
  registerGlobalSearchInput,
  useSearchDropdown,
} from '@pops/navigation';

import { UNDO_WINDOW_MS, showUndoToast } from '../foundation/feedback/undo-toast';
import { InventoryLayout } from './InventoryLayout';
import { openPaletteFromTopBar } from './palette/palette-opener';
import { TOPBAR_PLACEHOLDER } from './topbar/topbar-provider';

const custom = vi.hoisted(() => vi.fn());
const dismiss = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: { custom, dismiss },
}));

vi.mock('./palette/InventoryPalette', () => ({
  InventoryPalette: () => <div role="dialog" aria-label="Command palette" />,
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
  _clearSearchDropdowns();
  vi.unstubAllGlobals();
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

  it('opens the command palette and consumes Cmd-K', () => {
    const listener = vi.fn();
    document.addEventListener('keydown', listener);
    renderLayout();

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => document.body.dispatchEvent(event));

    expect(listener).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId('location')).toHaveTextContent('/inventory');
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    document.removeEventListener('keydown', listener);
  });

  it('registers the inventory search dropdown on mount and unregisters it on unmount', () => {
    const { result } = renderHook(() => useSearchDropdown('inventory'));
    const view = renderLayout();

    expect(result.current?.placeholder).toBe(TOPBAR_PLACEHOLDER);
    expect(result.current?.hotkeyLabel).toBe('/');
    expect(result.current?.openCompact).toBe(openPaletteFromTopBar);

    view.unmount();

    expect(result.current).toBeNull();
  });

  it('/ focuses the TopBar search', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    const search = document.createElement('input');
    document.body.append(search);
    registerGlobalSearchInput(search);
    renderLayout();

    fireEvent.keyDown(document.body, { key: '/' });

    expect(document.activeElement).toBe(search);

    const other = document.createElement('input');
    document.body.append(other);
    other.focus();
    fireEvent.keyDown(other, { key: '/' });
    expect(document.activeElement).toBe(other);
  });

  it('/ below 1024px opens the palette instead of focusing the hidden box', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      media: '(min-width: 1024px)',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    const search = document.createElement('input');
    document.body.append(search);
    registerGlobalSearchInput(search);
    renderLayout();

    fireEvent.keyDown(document.body, { key: '/' });

    expect(document.activeElement).not.toBe(search);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });
});
