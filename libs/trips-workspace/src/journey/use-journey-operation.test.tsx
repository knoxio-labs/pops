import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useJourneyNavigation } from './use-journey-navigation';
import { useJourneyOperation } from './use-journey-operation';

afterEach(cleanup);

it('blocks programmatic grouping mutations until a successful owner read, including after navigation', async () => {
  const mutation = vi.fn(async () => {});
  const { result, rerender } = renderHook(
    ({ journeyId }) => useJourneyOperation(useJourneyNavigation({ tripId: 7, journeyId })),
    { initialProps: { journeyId: 20 } }
  );
  await act(() => result.current.run(() => Promise.reject(new Error('Unknown commit result'))));
  expect(result.current.needsReload).toBe(true);
  await act(() => result.current.run(mutation));
  expect(mutation).not.toHaveBeenCalled();
  rerender({ journeyId: 30 });
  expect(result.current.failure).toBeUndefined();
  expect(result.current.needsReload).toBe(true);
  let release: (success: boolean) => void = () => {};
  const read = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  let recovery: Promise<void> | undefined;
  act(() => {
    recovery = result.current.reload(() => read);
  });
  expect(result.current.busy).toBe(true);
  await act(() => result.current.run(mutation));
  expect(mutation).not.toHaveBeenCalled();
  await act(async () => {
    release(false);
    await recovery;
  });
  expect(result.current.needsReload).toBe(true);
  await act(() => result.current.run(mutation));
  expect(mutation).not.toHaveBeenCalled();
  await act(() => result.current.reload(() => Promise.resolve(true)));
  expect(result.current.needsReload).toBe(false);
  await act(() => result.current.run(mutation));
  expect(mutation).toHaveBeenCalledTimes(1);
});
