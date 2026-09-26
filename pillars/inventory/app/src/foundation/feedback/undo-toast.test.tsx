import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { undoActiveToast } from './undo-shortcut';
import { UNDO_WINDOW_MS, UndoToast, getActiveUndoOffer, showUndoToast } from './undo-toast';

const custom = vi.hoisted(() => vi.fn());
const dismiss = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: { custom, dismiss },
}));

let nextId = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  nextId = 0;
  custom.mockImplementation((renderToast: (id: string) => unknown) => {
    const id = `toast-${++nextId}`;
    renderToast(id);
    return id;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('showUndoToast', () => {
  it('shows the newest offer and handles Cmd-Z once', async () => {
    const onUndo = vi.fn().mockResolvedValue(undefined);
    showUndoToast({ concept: 'move', message: 'Moved a box', onUndo });

    expect(getActiveUndoOffer()).toMatchObject({ state: 'offered', message: 'Moved a box' });
    expect(undoActiveToast(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))).toBe(true);
    expect(undoActiveToast(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))).toBe(true);

    await act(async () => undefined);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(getActiveUndoOffer()).toMatchObject({ state: 'undone' });
  });

  it('shows conflict after a refused undo and expires the offer', async () => {
    const onUndo = vi.fn().mockRejectedValue(new Error('changed'));
    showUndoToast({ concept: 'move', message: 'Moved a box', onUndo });

    undoActiveToast(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    await act(async () => undefined);
    expect(getActiveUndoOffer()).toMatchObject({ state: 'conflict' });

    act(() => vi.advanceTimersByTime(3000));
    expect(getActiveUndoOffer()).toBeNull();
  });

  it('renders the offered and conflict actions', () => {
    const onUndo = vi.fn();
    const onOpenHistory = vi.fn();
    const { rerender } = render(<UndoToast concept="move" message="Moved a box" onUndo={onUndo} />);
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(onUndo).toHaveBeenCalledOnce();

    rerender(
      <UndoToast
        concept="move"
        message="Moved a box"
        state="conflict"
        onOpenHistory={onOpenHistory}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open history' }));
    expect(onOpenHistory).toHaveBeenCalledOnce();
  });

  it('leaves Cmd-Z available to the browser after the offer window', () => {
    showUndoToast({ concept: 'move', message: 'Moved a box', onUndo: vi.fn() });
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS));
    expect(undoActiveToast(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))).toBe(false);
  });
});
