import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { undoActiveToast } from './undo-shortcut';
import {
  UNDO_RESULT_MS,
  UNDO_WINDOW_MS,
  UndoToast,
  getActiveUndoOffer,
  runActiveUndo,
  showUndoToast,
} from './undo-toast';

import type { ReactElement } from 'react';

interface ToastOptions {
  id?: string | number;
  duration?: number;
  onDismiss?: () => void;
  onAutoClose?: () => void;
}

const custom = vi.hoisted(() => vi.fn());
const dismiss = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: { custom, dismiss },
}));

let nextId = 0;
let latestOptions: ToastOptions | undefined;

function renderLatestToast(
  renderToast: (id: string | number) => ReactElement,
  options?: ToastOptions
): string | number {
  const id = options?.id ?? `toast-${++nextId}`;
  latestOptions = options;
  renderToast(id);
  return id;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  nextId = 0;
  latestOptions = undefined;
  custom.mockImplementation(renderLatestToast);
});

afterEach(() => {
  latestOptions?.onDismiss?.();
  vi.useRealTimers();
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value) => {
      if (resolvePromise === undefined) throw new Error('resolver not ready');
      resolvePromise(value);
    },
    reject: (reason) => {
      if (rejectPromise === undefined) throw new Error('rejecter not ready');
      rejectPromise(reason);
    },
  };
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('showUndoToast', () => {
  it('keeps only the newest offer and expires it after eight seconds', () => {
    const firstId = showUndoToast({
      concept: 'move',
      message: 'Moved the lamp',
      onUndo: vi.fn().mockResolvedValue(undefined),
    });
    const secondId = showUndoToast({
      concept: 'pickUp',
      message: 'Picked up the lamp',
      onUndo: vi.fn().mockResolvedValue(undefined),
    });

    expect(dismiss).toHaveBeenCalledWith(firstId);
    expect(secondId).not.toBe(firstId);
    expect(getActiveUndoOffer()).toMatchObject({
      concept: 'pickUp',
      message: 'Picked up the lamp',
      state: 'offered',
    });

    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS - 1));
    expect(getActiveUndoOffer()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(getActiveUndoOffer()).toBeNull();
  });

  it('runs an async undo once, shows the resolved state, and expires the result', async () => {
    const operation = deferred<void>();
    const onUndo = vi.fn(() => operation.promise);
    showUndoToast({ concept: 'move', message: 'Moved a box', onUndo });

    runActiveUndo();
    runActiveUndo();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(getActiveUndoOffer()).toMatchObject({ state: 'offered' });

    operation.resolve(undefined);
    await flushAsyncWork();

    expect(getActiveUndoOffer()).toMatchObject({ state: 'undone' });
    expect(latestOptions?.duration).toBe(UNDO_RESULT_MS);
    act(() => vi.advanceTimersByTime(UNDO_RESULT_MS));
    expect(getActiveUndoOffer()).toBeNull();
  });

  it('shows a conflict when the async undo is refused', async () => {
    const onUndo = vi.fn().mockRejectedValue(new Error('changed since'));
    showUndoToast({ concept: 'move', message: 'Moved a box', onUndo });

    runActiveUndo();
    await flushAsyncWork();

    expect(getActiveUndoOffer()).toMatchObject({ state: 'conflict' });
    act(() => vi.advanceTimersByTime(UNDO_RESULT_MS));
    expect(getActiveUndoOffer()).toBeNull();
  });

  it('ignores a settled result from an offer replaced while undo was pending', async () => {
    const oldOperation = deferred<void>();
    showUndoToast({
      concept: 'move',
      message: 'Moved the old box',
      onUndo: () => oldOperation.promise,
    });
    runActiveUndo();

    showUndoToast({
      concept: 'retired',
      message: 'Retired the new box',
      onUndo: vi.fn().mockResolvedValue(undefined),
    });
    oldOperation.resolve(undefined);
    await flushAsyncWork();

    expect(getActiveUndoOffer()).toMatchObject({
      message: 'Retired the new box',
      state: 'offered',
    });
  });

  it('clears the active offer when Sonner dismisses or auto-closes it', () => {
    showUndoToast({
      concept: 'move',
      message: 'Moved a box',
      onUndo: vi.fn().mockResolvedValue(undefined),
    });
    latestOptions?.onDismiss?.();
    expect(getActiveUndoOffer()).toBeNull();

    showUndoToast({
      concept: 'move',
      message: 'Moved another box',
      onUndo: vi.fn().mockResolvedValue(undefined),
    });
    latestOptions?.onAutoClose?.();
    expect(getActiveUndoOffer()).toBeNull();
  });

  it('leaves Cmd/Ctrl-Z available to the browser after the offer expires', () => {
    showUndoToast({
      concept: 'move',
      message: 'Moved a box',
      onUndo: vi.fn().mockResolvedValue(undefined),
    });
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS));

    expect(undoActiveToast(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))).toBe(false);
    expect(undoActiveToast(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))).toBe(false);
  });
});

describe('UndoToast', () => {
  it('renders the offered, resolved, and conflict result actions', () => {
    const onUndo = vi.fn();
    const onOpenHistory = vi.fn();
    const { rerender } = render(<UndoToast concept="move" message="Moved a box" onUndo={onUndo} />);

    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(onUndo).toHaveBeenCalledOnce();

    rerender(<UndoToast concept="move" message="Moved a box" state="undone" />);
    expect(screen.getByRole('status')).toHaveTextContent('Undone: Moved a box');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <UndoToast
        concept="move"
        message="Moved a box"
        state="conflict"
        onOpenHistory={onOpenHistory}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Could not undo: it changed since.');
    fireEvent.click(screen.getByRole('button', { name: 'Open history' }));
    expect(onOpenHistory).toHaveBeenCalledOnce();
  });
});
