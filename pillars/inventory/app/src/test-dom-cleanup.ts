import { act, cleanup } from '@testing-library/react';

interface PendingTask {
  readonly completion: Promise<void>;
  readonly cancel: () => void;
}

function observeTimeouts(
  originalSetTimeout: typeof setTimeout,
  pending: Map<number, PendingTask>
): typeof setTimeout {
  function schedule<TArgs extends unknown[]>(
    callback: (...args: TArgs) => void,
    delay?: number,
    ...args: TArgs
  ): NodeJS.Timeout {
    if (typeof callback !== 'function' || (delay !== undefined && delay !== 0)) {
      return originalSetTimeout(callback, delay, ...args);
    }
    let complete: () => void = () => {};
    const completion = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const handle = originalSetTimeout(
      function invoke(this: NodeJS.Timeout, ...forwardedArgs: TArgs) {
        try {
          callback.apply(this, forwardedArgs);
        } finally {
          pending.delete(Number(handle));
          complete();
        }
      },
      delay,
      ...args
    );
    pending.set(Number(handle), { completion, cancel: complete });
    return handle;
  }

  const observedSetTimeout = Object.assign(schedule, originalSetTimeout);
  Object.defineProperties(observedSetTimeout, Object.getOwnPropertyDescriptors(originalSetTimeout));
  return observedSetTimeout;
}

/**
 * Owns a test's native immediate tasks until its roots and queued work finish.
 * Radix FocusScope unmounts and TanStack Query notifications both use timeout 0;
 * React's act does not await those external schedulers. Delayed timers retain
 * their own lifecycle. Fake clocks must be restored by the fixture that owns them.
 */
export function observeTestDomTasks(): { cleanup: () => Promise<void> } {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const setDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
  const clearDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'clearTimeout');
  if (setDescriptor === undefined || clearDescriptor === undefined) {
    throw new Error('Test DOM task ownership requires native timer properties');
  }
  const pending = new Map<number, PendingTask>();
  const observedSetTimeout = observeTimeouts(originalSetTimeout, pending);

  function cancel(handle: Parameters<typeof clearTimeout>[0]): void {
    originalClearTimeout(handle);
    const task = pending.get(Number(handle));
    pending.delete(Number(handle));
    task?.cancel();
  }

  Object.defineProperty(globalThis, 'setTimeout', { ...setDescriptor, value: observedSetTimeout });
  Object.defineProperty(globalThis, 'clearTimeout', { ...clearDescriptor, value: cancel });

  return {
    async cleanup() {
      try {
        if (globalThis.setTimeout !== observedSetTimeout || globalThis.clearTimeout !== cancel) {
          throw new Error('Restore the fixture timer implementation before test DOM cleanup');
        }
        await act(async () => {
          cleanup();
          while (pending.size > 0) {
            await Promise.all([...pending.values()].map((task) => task.completion));
          }
        });
      } finally {
        Object.defineProperty(globalThis, 'setTimeout', setDescriptor);
        Object.defineProperty(globalThis, 'clearTimeout', clearDescriptor);
      }
    },
  };
}
