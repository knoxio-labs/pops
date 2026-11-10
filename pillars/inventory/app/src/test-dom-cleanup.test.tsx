import { setImmediate } from 'node:timers/promises';
import { transferableAbortController } from 'node:util';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@pops/ui';

import { observeTestDomTasks } from './test-dom-cleanup';

type Lifecycle = ReturnType<typeof observeTestDomTasks>;

async function finishAtBoundary(lifecycle: Lifecycle, boundary: () => void): Promise<void> {
  const completion = lifecycle.cleanup().then(boundary);
  // React act uses Node's check queue; let it settle before releasing the held timers.
  await setImmediate();
  await setImmediate();
  try {
    await vi.runAllTimersAsync();
    await completion;
    await vi.runOnlyPendingTimersAsync();
  } finally {
    vi.unstubAllGlobals();
    await completion;
  }
}

function restoreNativeEventConstructor(): void {
  const controller = transferableAbortController();
  controller.signal.addEventListener('abort', (event) => {
    vi.stubGlobal('CustomEvent', event.constructor);
  });
  controller.abort();
}

function renderDialog(onCloseAutoFocus: (event: Event) => void) {
  return render(
    <Dialog open>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} aria-describedby={undefined}>
        <DialogTitle>Lifecycle fixture</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

function QueryFixture() {
  useQuery({ queryKey: ['lifecycle'], queryFn: () => 'initial', initialData: 'initial' });
  return null;
}

function renderQuery(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <QueryFixture />
    </QueryClientProvider>
  );
}

describe('test DOM immediate task ownership', () => {
  it.each([false, true])(
    'finishes Radix focus restoration before the event realm is removed (earlier unmount: %s)',
    async (earlierUnmount) => {
      vi.useFakeTimers();
      const lifecycle = observeTestDomTasks();
      const order: string[] = [];
      const onCloseAutoFocus = vi.fn<(event: Event) => void>(() => {
        order.push('focus');
      });
      try {
        const view = renderDialog(onCloseAutoFocus);
        if (earlierUnmount) view.unmount();

        await finishAtBoundary(lifecycle, () => {
          order.push('dispose');
          restoreNativeEventConstructor();
        });

        expect(onCloseAutoFocus).toHaveBeenCalledOnce();
        expect(onCloseAutoFocus.mock.calls[0]?.[0]).toBeInstanceOf(window.Event);
        expect(order).toEqual(['focus', 'dispose']);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.unstubAllGlobals();
        vi.useRealTimers();
      }
    }
  );

  it.each([false, true])(
    'finishes query notifications before window is removed (earlier unmount: %s)',
    async (earlierUnmount) => {
      vi.useFakeTimers();
      const lifecycle = observeTestDomTasks();
      const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
      try {
        const view = renderQuery(client);
        client.setQueryData(['lifecycle'], 'changed');
        if (earlierUnmount) view.unmount();

        await finishAtBoundary(lifecycle, () => {
          vi.stubGlobal('window', undefined);
        });

        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.unstubAllGlobals();
        client.clear();
        vi.useRealTimers();
      }
    }
  );

  it('waits for immediate tasks scheduled by other owned callbacks', async () => {
    vi.useFakeTimers();
    const lifecycle = observeTestDomTasks();
    const order: string[] = [];
    try {
      setTimeout(() => {
        order.push('outer');
        setTimeout(() => {
          order.push('inner');
        }, 0);
      }, 0);

      await finishAtBoundary(lifecycle, () => {
        order.push('dispose');
      });

      expect(order).toEqual(['outer', 'inner', 'dispose']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('includes immediate tasks created by microtasks during React cleanup', async () => {
    vi.useFakeTimers();
    const lifecycle = observeTestDomTasks();
    const order: string[] = [];
    try {
      queueMicrotask(() => {
        setTimeout(() => {
          order.push('task');
        }, 0);
      });

      await finishAtBoundary(lifecycle, () => {
        order.push('dispose');
      });

      expect(order).toEqual(['task', 'dispose']);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['handle', 'number', 'string'])(
    'finishes a task canceled through clearTimeout with its %s',
    async (kind) => {
      vi.useFakeTimers();
      const lifecycle = observeTestDomTasks();
      const callback = vi.fn();
      try {
        const handle = setTimeout(callback, 0);
        if (kind === 'handle') clearTimeout(handle);
        if (kind === 'number') clearTimeout(Number(handle));
        if (kind === 'string') clearTimeout(String(Number(handle)));

        await lifecycle.cleanup();

        expect(callback).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it('preserves callback arguments and native handle identity', async () => {
    const original = globalThis.setTimeout;
    const lifecycle = observeTestDomTasks();
    const callback = vi.fn<(this: NodeJS.Timeout, value: string, count: number) => void>();
    try {
      const handle = setTimeout(callback, 0, 'forwarded', 42);
      expect(handle.refresh).toBeTypeOf('function');
      await lifecycle.cleanup();

      expect(callback.mock.contexts).toEqual([handle]);
      expect(callback).toHaveBeenCalledExactlyOnceWith('forwarded', 42);
      expect(globalThis.setTimeout).toBe(original);
    } finally {
      expect(globalThis.setTimeout).toBe(original);
    }
  });

  it('leaves callback errors visible to the scheduler without stranding cleanup', async () => {
    vi.useFakeTimers();
    const lifecycle = observeTestDomTasks();
    const error = new Error('callback failure');
    try {
      setTimeout(() => {
        throw error;
      }, 0);

      expect(() => vi.advanceTimersByTime(0)).toThrow(error);
      await lifecycle.cleanup();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('owns the default immediate delay while leaving delayed timers with their fixture', async () => {
    vi.useFakeTimers();
    const lifecycle = observeTestDomTasks();
    const immediate = vi.fn();
    const delayed = vi.fn();
    try {
      setTimeout(immediate);
      const delayedHandle = setTimeout(delayed, 1000);
      const completion = lifecycle.cleanup();
      await vi.advanceTimersByTimeAsync(0);
      await completion;

      expect(immediate).toHaveBeenCalledOnce();
      expect(delayed).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);
      clearTimeout(delayedHandle);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['restore then fake', 'fake then reset'])(
    'retains ownership across the existing fixture order: %s',
    async (order) => {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
      const lifecycle = observeTestDomTasks();
      if (order === 'restore then fake') vi.restoreAllMocks();
      vi.useFakeTimers();
      if (order === 'fake then reset') vi.resetAllMocks();
      vi.useRealTimers();
      const onCloseAutoFocus = vi.fn();
      const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
      try {
        renderDialog(onCloseAutoFocus);
        renderQuery(client);
        client.setQueryData(['lifecycle'], 'changed');

        await lifecycle.cleanup();

        expect(onCloseAutoFocus).toHaveBeenCalledOnce();
        expect(Object.getOwnPropertyDescriptor(globalThis, 'setTimeout')).toEqual(descriptor);
      } finally {
        client.clear();
      }
    }
  );

  it('reports timer replacement and restores the original descriptors', async () => {
    const setDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
    const clearDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'clearTimeout');
    const original = globalThis.setTimeout;
    const lifecycle = observeTestDomTasks();
    globalThis.setTimeout = original;

    await expect(lifecycle.cleanup()).rejects.toThrow('Restore the fixture timer implementation');

    expect(Object.getOwnPropertyDescriptor(globalThis, 'setTimeout')).toEqual(setDescriptor);
    expect(Object.getOwnPropertyDescriptor(globalThis, 'clearTimeout')).toEqual(clearDescriptor);
  });
});
